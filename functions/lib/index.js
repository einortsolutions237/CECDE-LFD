"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUserDeleted = exports.onTeamDeleted = exports.handleUserUpdates = exports.processNewUserOnboarding = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();
// ----------------------------------------------------------------------------
// 1. CENTRALIZED RANKING ENGINE
// ----------------------------------------------------------------------------
function calculateRank(directs, downline, active) {
    if (directs >= 20 && downline >= 1000 && active >= 100)
        return 'Crown Ambassador';
    if (directs >= 15 && downline >= 500 && active >= 50)
        return 'Diamond';
    if (directs >= 10 && downline >= 100 && active >= 25)
        return 'Platinum';
    if (directs >= 8 && downline >= 50 && active >= 15)
        return 'Gold';
    if (directs >= 5 && downline >= 20 && active >= 5)
        return 'Silver';
    if (directs >= 3 && downline >= 5 && active >= 2)
        return 'Bronze';
    return 'Member';
}
// ----------------------------------------------------------------------------
// 2. CENTRALIZED ONBOARDING ORCHESTRATOR
// ----------------------------------------------------------------------------
exports.processNewUserOnboarding = functions.firestore
    .document('users/{userId}')
    .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const newUser = snap.data();
    let sponsorId = newUser.sponsorId;
    if (!sponsorId || sponsorId === 'SYSTEM') {
        // Basic initialization for users without sponsors
        const statsRef = db.collection('system_stats').doc('global');
        await statsRef.set({ totalUsers: admin.firestore.FieldValue.increment(1) }, { merge: true });
        return null;
    }
    try {
        // Orchestrate everything sequentially
        await db.runTransaction(async (transaction) => {
            const uRef = db.collection('users').doc(userId);
            const sponsorRef = db.collection('users').doc(sponsorId);
            const sponsorDoc = await transaction.get(sponsorRef);
            // 1. Validate sponsor
            if (!sponsorDoc.exists) {
                throw new Error('Sponsor does not exist');
            }
            const sponsorData = sponsorDoc.data();
            if (sponsorData.activityState === 'suspended') {
                throw new Error('Sponsor is suspended and cannot recruit');
            }
            // 2. Determine teamId (assign BEFORE propagation)
            let newTeamId = sponsorId;
            let newSponsorRoleType = sponsorData.roleType;
            const currentDirects = sponsorData.directReferralsCount || 0;
            const newDirectsCount = currentDirects + 1;
            // Upgrading sponsor to team leader requires 5 directs now (strict logic)
            if (newDirectsCount >= 5 && sponsorData.roleType !== 'team_leader' && sponsorData.roleType !== 'admin') {
                newSponsorRoleType = 'team_leader';
                newTeamId = sponsorId; // Sponsor becomes their own team leader
            }
            else if (sponsorData.teamId) {
                newTeamId = sponsorData.teamId;
            }
            // 3. Update Sponsor Document
            transaction.update(sponsorRef, {
                directReferralsCount: newDirectsCount,
                roleType: newSponsorRoleType,
                teamId: newSponsorRoleType === 'team_leader' ? sponsorId : (sponsorData.teamId || sponsorId),
            });
            // 4. Set initial user defaults based on finalized teamId
            transaction.update(uRef, {
                teamId: newTeamId,
                roleType: newUser.roleType === 'admin' ? 'admin' : 'team_member',
                activityState: 'dormant',
                currentRank: 'Member',
                directReferralsCount: 0,
                totalDownlineCount: 0,
                walletBalance: 0,
            });
            // 5. Update Sponsor Network Metrics
            const sponsorNetworkRef = db.collection('network').doc(sponsorId);
            const sponsorNetworkDoc = await transaction.get(sponsorNetworkRef);
            if (sponsorNetworkDoc.exists) {
                transaction.update(sponsorNetworkRef, {
                    directReferrals: admin.firestore.FieldValue.arrayUnion(userId),
                    activeDownlineCount: admin.firestore.FieldValue.increment(1) // Assuming dormant still counts loosely as downline presence
                });
            }
            else {
                transaction.set(sponsorNetworkRef, {
                    uid: sponsorId,
                    directReferrals: [userId],
                    activeDownlineCount: 1,
                    totalDownlineCount: 1
                });
            }
            // 6. Update Team Metrics centrally
            if (newTeamId && newTeamId !== 'SYSTEM') {
                const teamRef = db.collection('teams').doc(newTeamId);
                const teamDoc = await transaction.get(teamRef);
                const isDirectForTeam = (newTeamId === sponsorId);
                let scoreIncrement = isDirectForTeam ? 5 : 2;
                if (teamDoc.exists) {
                    const teamUpdates = {
                        totalMembers: admin.firestore.FieldValue.increment(1),
                        totalDownlineCount: admin.firestore.FieldValue.increment(1),
                        leaderPerformanceScore: admin.firestore.FieldValue.increment(scoreIncrement)
                    };
                    if (isDirectForTeam) {
                        teamUpdates.leaderDirectReferralsCount = admin.firestore.FieldValue.increment(1);
                    }
                    transaction.update(teamRef, teamUpdates);
                }
                else if (newSponsorRoleType === 'team_leader' && newTeamId === sponsorId) {
                    transaction.set(teamRef, {
                        teamLeaderId: sponsorId,
                        teamLeaderName: sponsorData.fullName || 'Team Leader',
                        totalMembers: sponsorData.totalDownlineCount ? sponsorData.totalDownlineCount + 1 : 1,
                        activeMembers: sponsorData.activityState === 'active' ? 1 : 0,
                        leaderPerformanceScore: scoreIncrement,
                        totalDownlineCount: 1,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
            // 7. Update Global Stats
            const statsRef = db.collection('system_stats').doc('global');
            transaction.set(statsRef, {
                totalUsers: admin.firestore.FieldValue.increment(1)
            }, { merge: true });
        });
        // 8. Independent Async Network Propagation (Optimized batch traversal)
        await propagateAncestryUpdatesSafely(sponsorId, userId);
        // 9. Central Notification
        await db.collection('notifications').add({
            userId: sponsorId,
            title: 'New Referral Joined!',
            message: `${newUser.fullName || 'A new user'} has registered using your referral link.`,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    catch (e) {
        console.error(`Error in processNewUserOnboarding for user ${userId}`, e);
    }
    return null;
});
// ----------------------------------------------------------------------------
// 3. SAFE NETWORK PROPAGATION LOGIC
// ----------------------------------------------------------------------------
async function propagateAncestryUpdatesSafely(sponsorId, newUserId) {
    var _a;
    let currentId = sponsorId;
    let sponsorPaths = [];
    const maxLevels = 50;
    // 3a. Ancestry Retrieval (Detects Circular References)
    for (let i = 0; i < maxLevels; i++) {
        if (!currentId || currentId === 'SYSTEM')
            break;
        if (sponsorPaths.includes(currentId)) {
            console.error(`Circular hierarchy detected at ${currentId}`);
            break;
        }
        sponsorPaths.push(currentId);
        const parentDoc = await db.collection('users').doc(currentId).get();
        if (!parentDoc.exists)
            break;
        currentId = (_a = parentDoc.data()) === null || _a === void 0 ? void 0 : _a.sponsorId;
    }
    // 3b. Batch Update Ancestors limits writes
    if (sponsorPaths.length === 0)
        return;
    const batchSize = 100;
    for (let i = 0; i < sponsorPaths.length; i += batchSize) {
        const batch = db.batch();
        const currentChunk = sponsorPaths.slice(i, i + batchSize);
        for (const sId of currentChunk) {
            const uRef = db.collection('users').doc(sId);
            const netRef = db.collection('network').doc(sId);
            batch.update(uRef, { totalDownlineCount: admin.firestore.FieldValue.increment(1) });
            batch.set(netRef, { totalDownlineCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
        }
        await batch.commit();
    }
    // 3c. Assess Rank Upgrades for Sponsors after downline increases
    for (const sId of sponsorPaths) {
        await checkAndUpgradeRank(sId);
    }
}
// ----------------------------------------------------------------------------
// 4. CENTRAL RANK UPGRADE ASSESSOR
// ----------------------------------------------------------------------------
async function checkAndUpgradeRank(userId) {
    try {
        const uRef = db.collection('users').doc(userId);
        const uDoc = await uRef.get();
        if (!uDoc.exists)
            return;
        const uData = uDoc.data();
        const directs = uData.directReferralsCount || 0;
        const downline = uData.totalDownlineCount || 0;
        // Mock active members logic, in a real system this queries the network
        const activeRaw = uData.activityState === 'active' ? 1 : 0; // fallback simplified logic
        let estimatedActive = Math.floor(downline * 0.3) + activeRaw; // Just a placeholder for scaling efficiency without heavy reads
        const calculatedRank = calculateRank(directs, downline, estimatedActive);
        if (uData.currentRank !== calculatedRank) {
            const rankOrder = ['Member', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Crown Ambassador'];
            const isUpgrade = rankOrder.indexOf(calculatedRank) > rankOrder.indexOf(uData.currentRank || 'Member');
            await uRef.update({ currentRank: calculatedRank });
            await db.collection('notifications').add({
                userId: userId,
                title: isUpgrade ? 'Rank Upgraded!' : 'Rank Adjusted',
                message: isUpgrade
                    ? `Congratulations! Your rank has been upgraded to ${calculatedRank}.`
                    : `Your rank has been adjusted to ${calculatedRank}.`,
                isRead: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    }
    catch (error) {
        console.error(`Rank update failed for ${userId}`, error);
    }
}
// ----------------------------------------------------------------------------
// 5. UNIFIED ACTIVITY STATE MANAGER
// ----------------------------------------------------------------------------
exports.handleUserUpdates = functions.firestore
    .document('users/{userId}')
    .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    // 5a. Recalculate Activity State
    const nextState = (newData.directReferralsCount || 0) >= 3 ? 'active' : 'dormant';
    if (newData.activityState !== nextState) {
        await change.after.ref.update({ activityState: nextState });
        // Adjust Global Active Metrics
        const statsRef = db.collection('system_stats').doc('global');
        const diff = nextState === 'active' ? 1 : -1;
        await statsRef.set({ activeUsers: admin.firestore.FieldValue.increment(diff) }, { merge: true });
        // Adjust Team Metrics
        if (newData.teamId) {
            const tScore = nextState === 'active' ? 3 : -3;
            await db.collection('teams').doc(newData.teamId).set({
                activeMembers: admin.firestore.FieldValue.increment(diff),
                activeDownlineCount: admin.firestore.FieldValue.increment(diff),
                leaderPerformanceScore: admin.firestore.FieldValue.increment(tScore)
            }, { merge: true }).catch((e) => console.error("Team update error", e));
        }
        if (nextState === 'active') {
            await db.collection('notifications').add({
                userId: context.params.userId,
                title: 'Activity Status Update',
                message: 'Congratulations! You are now an Active Member.',
                isRead: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    }
    // 5b. Recalculate Rank when critical values change
    if (newData.directReferralsCount !== oldData.directReferralsCount ||
        newData.totalDownlineCount !== oldData.totalDownlineCount) {
        await checkAndUpgradeRank(context.params.userId);
    }
    return null;
});
// ----------------------------------------------------------------------------
// 7. CASCADE TEAM DELETION
// ----------------------------------------------------------------------------
exports.onTeamDeleted = functions.firestore
    .document('teams/{teamId}')
    .onUpdate(async (change, context) => {
    const teamId = context.params.teamId;
    const newData = change.after.data();
    const oldData = change.before.data();
    // Check if the team was just marked as deleted
    if (newData.status === 'deleted' && oldData.status !== 'deleted') {
        const leaderId = newData.teamLeaderId;
        try {
            // Find all users belonging to this team, or sponsored by the team leader, or the leader
            const usersQuery = await db.collection('users').where('teamId', '==', teamId).get();
            const userIdsToDelete = new Set();
            usersQuery.forEach((doc) => userIdsToDelete.add(doc.id));
            if (leaderId)
                userIdsToDelete.add(leaderId);
            const batchSize = 100;
            const idsArray = Array.from(userIdsToDelete);
            for (let i = 0; i < idsArray.length; i += batchSize) {
                const chunk = idsArray.slice(i, i + batchSize);
                const batch = db.batch();
                for (const id of chunk) {
                    batch.delete(db.collection('users').doc(id));
                    batch.delete(db.collection('network').doc(id));
                }
                await batch.commit();
                console.log(`Deleted chunk of ${chunk.length} users and network documents for deleted team ${teamId}`);
            }
            // Finally, delete the actual team document using Admin SDK (bypasses rules)
            await db.collection('teams').doc(teamId).delete();
        }
        catch (e) {
            console.error(`Error cascaded deletion for team ${teamId}`, e);
        }
    }
    return null;
});
exports.onUserDeleted = functions.firestore
    .document('users/{userId}')
    .onDelete(async (snap, context) => {
    try {
        await admin.auth().deleteUser(context.params.userId);
        console.log(`Deleted auth user ${context.params.userId}`);
    }
    catch (e) {
        if (e.code !== 'auth/user-not-found') {
            console.error("Error deleting auth for user", context.params.userId, e);
        }
    }
    return null;
});
//# sourceMappingURL=index.js.map