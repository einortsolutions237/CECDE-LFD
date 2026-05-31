import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize core services
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// ----------------------------------------------------------------------------
// 1. CENTRALIZED RANKING ENGINE
// ----------------------------------------------------------------------------
let rankConfigCache: any = null;
let lastRankConfigFetch = 0;

async function getRankConfig(transaction?: admin.firestore.Transaction) {
  const now = Date.now();
  if (rankConfigCache && (now - lastRankConfigFetch < 300000)) { 
     return rankConfigCache;
  }
  
  const docRef = db.collection('system_settings').doc('ranks');
  let configDoc;
  if (transaction) {
    configDoc = await transaction.get(docRef);
  } else {
    configDoc = await docRef.get();
  }
  
  if (configDoc.exists && configDoc.data()?.ranks) {
     rankConfigCache = configDoc.data();
     lastRankConfigFetch = now;
     return rankConfigCache;
  }
  
  return { 
    ranks: [
      { name: 'Crown Ambassador', directs: 20, downline: 1000, activeDownline: 100 },
      { name: 'Diamond', directs: 15, downline: 500, activeDownline: 50 },
      { name: 'Team Leader', directs: 20, downline: 50, activeDownline: 0 },
      { name: 'Platinum', directs: 10, downline: 100, activeDownline: 25 },
      { name: 'Gold', directs: 8, downline: 50, activeDownline: 15 },
      { name: 'Silver', directs: 5, downline: 20, activeDownline: 5 },
      { name: 'Bronze', directs: 3, downline: 5, activeDownline: 2 }
    ]
  };
}

export async function calculateRankAsync(userData: any, transaction?: admin.firestore.Transaction): Promise<string> {
  const config = await getRankConfig(transaction);
  const ranksList = config.ranks || [];
  
  const directs = userData.directReferralsCount || 0;
  const downline = userData.totalDownlineCount || 0;
  const activeReferrals = userData.activeReferralsCount || 0; 
  const activeDownline = userData.activeDownlineCount || 0;

  for (const rank of ranksList) {
     if (
         directs >= (rank.directs || 0) &&
         downline >= (rank.downline || 0) &&
         activeDownline >= (rank.activeDownline || 0)
     ) {
         return rank.name;
     }
  }
  return 'Member';
}

async function updateRankSafely(userId: string, currentData: any, transaction?: admin.firestore.Transaction) {
  const calculatedRank = await calculateRankAsync(currentData, transaction);
  if (currentData.currentRank !== calculatedRank) {
    const uRef = db.collection('users').doc(userId);
    if (transaction) {
      transaction.update(uRef, { currentRank: calculatedRank });
    } else {
      await uRef.update({ currentRank: calculatedRank });
    }
    
    const config = await getRankConfig(transaction);
    const dynamicRankOrder = ['Member', ...[...(config.ranks || [])].reverse().map((r: any) => r.name)];
    const isUpgrade = dynamicRankOrder.indexOf(calculatedRank) > dynamicRankOrder.indexOf(currentData.currentRank || 'Member');
    
    // Trigger automated email notification for Team Leader
    if (calculatedRank === 'Team Leader' && currentData.currentRank !== 'Team Leader' && isUpgrade) {
      db.collection('mail').add({
        toUids: [userId],
        template: {
          name: 'rank_achieved_team_leader',
          data: { rank: 'Team Leader', directs: 20, teamMembers: 50 }
        }
      });
    }

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

// ----------------------------------------------------------------------------
// 2. TRUE HIERARCHY / ANCESTRY LOGIC
// ----------------------------------------------------------------------------
async function getAncestorPath(sponsorId: string | null): Promise<string[]> {
  if (!sponsorId || sponsorId === 'SYSTEM') return [];
  const paths: string[] = [];
  let currentId: string | null = sponsorId;
  const maxLevels = 1000;
  
  for (let i = 0; i < maxLevels; i++) {
    if (!currentId || currentId === 'SYSTEM') break;
    if (paths.includes(currentId)) {
      console.warn(`Circular hierarchy detected at ${currentId}. Stopping traversal.`);
      break;
    }
    paths.push(currentId);
    
    const uDoc = await db.collection('users').doc(currentId).get();
    if (!uDoc.exists) break;
    currentId = uDoc.data()?.sponsorId || null;
  }
  return paths;
}

// ----------------------------------------------------------------------------
// 3. CENTRALIZED ONBOARDING ORCHESTRATOR
// ----------------------------------------------------------------------------
export const processNewUserOnboarding = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap: any, context: any) => {
    const userId = context.params.userId;
    const newUser = snap.data();
    let sponsorId = newUser.sponsorId;

    if (!sponsorId || sponsorId === 'SYSTEM') {
      const statsRef = db.collection('system_stats').doc('global');
      await statsRef.set({ totalUsers: admin.firestore.FieldValue.increment(1) }, { merge: true });
      return null;
    }

    try {
      const ancestors = await getAncestorPath(sponsorId);
      
      await db.runTransaction(async (transaction: any) => {
        const uRef = db.collection('users').doc(userId);
        const sponsorRef = db.collection('users').doc(sponsorId);
        
        const sponsorDoc = await transaction.get(sponsorRef);
        if(!sponsorDoc.exists) throw new Error("Sponsor not found");
        const sponsorData = sponsorDoc.data()!;

        if (sponsorData.status === 'suspended' || sponsorData.activityState === 'suspended' || sponsorData.status === 'archived') {
          throw new Error('Sponsor is suspended or inactive.');
        }

        let newTeamId = sponsorId;
        let newSponsorRoleType = sponsorData.roleType;
        const currentDirects = sponsorData.directReferralsCount || 0;
        const newDirectsCount = currentDirects + 1;

        if (newDirectsCount >= 5 && sponsorData.roleType !== 'team_leader' && sponsorData.roleType !== 'admin') {
          newSponsorRoleType = 'team_leader';
          newTeamId = sponsorId;
        } else if (sponsorData.teamId) {
          newTeamId = sponsorData.teamId;
        } else {
          newTeamId = 'SYSTEM';
        }

        // Initialize user
        transaction.update(uRef, {
          teamId: newTeamId,
          roleType: newUser.roleType === 'admin' ? 'admin' : 'team_member',
          activityState: 'dormant',
          status: 'active',
          currentRank: 'Member',
          directReferralsCount: 0,
          activeReferralsCount: 0,
          dormantReferralsCount: 0,
          suspendedReferralsCount: 0,
          indirectReferralCount: 0,
          activeIndirectReferralCount: 0,
          dormantIndirectReferralCount: 0,
          totalDownlineCount: 0,
          activeDownlineCount: 0,
          dormantDownlineCount: 0,
          suspendedDownlineCount: 0,
          leaderboardScore: 0,
          uplineIds: ancestors
        });

        const netRef = db.collection('network').doc(userId);
        transaction.set(netRef, {
           uid: userId, 
           directReferrals: [],
           uplineIds: ancestors
        });

        // Update immediately sponsor (Direct)
        transaction.update(sponsorRef, {
          directReferralsCount: newDirectsCount,
          dormantReferralsCount: admin.firestore.FieldValue.increment(1),
          totalDownlineCount: admin.firestore.FieldValue.increment(1),
          dormantDownlineCount: admin.firestore.FieldValue.increment(1),
          leaderboardScore: admin.firestore.FieldValue.increment(10),
          roleType: newSponsorRoleType,
          teamId: newSponsorRoleType === 'team_leader' ? sponsorId : (sponsorData.teamId || 'SYSTEM')
        });

        const sponsorNetworkRef = db.collection('network').doc(sponsorId);
        transaction.set(sponsorNetworkRef, { directReferrals: admin.firestore.FieldValue.arrayUnion(userId) }, { merge: true });

        // Update Ancestors (Indirects and Downline) for Level 2+
        for(let i = 1; i < ancestors.length; i++) {
           const ancestorId = ancestors[i];
           transaction.update(db.collection('users').doc(ancestorId), {
              indirectReferralCount: admin.firestore.FieldValue.increment(1),
              dormantIndirectReferralCount: admin.firestore.FieldValue.increment(1),
              totalDownlineCount: admin.firestore.FieldValue.increment(1),
              dormantDownlineCount: admin.firestore.FieldValue.increment(1),
              leaderboardScore: admin.firestore.FieldValue.increment(3), // 3 points per indirect
           });
        }

        // Team Metrics Update
        if (newTeamId && newTeamId !== 'SYSTEM') {
          const teamRef = db.collection('teams').doc(newTeamId);
          const teamDoc = await transaction.get(teamRef);
          const isDirectForTeam = (newTeamId === sponsorId);

          if (teamDoc.exists) {
             const teamUpdates: any = {
               totalMembers: admin.firestore.FieldValue.increment(1),
               dormantMembers: admin.firestore.FieldValue.increment(1)
             };
             if (isDirectForTeam) teamUpdates.leaderDirectReferralsCount = admin.firestore.FieldValue.increment(1);
             transaction.update(teamRef, teamUpdates);
          } else if (newSponsorRoleType === 'team_leader' && newTeamId === sponsorId) {
             transaction.set(teamRef, {
               teamLeaderId: sponsorId,
               teamLeaderName: sponsorData.fullName || 'Team Leader',
               status: 'active',
               totalMembers: 1, 
               activeMembers: 0,
               dormantMembers: 1,
               suspendedMembers: 0,
               createdAt: admin.firestore.FieldValue.serverTimestamp()
             });
          }
        }

        const statsRef = db.collection('system_stats').doc('global');
        transaction.set(statsRef, {
          totalUsers: admin.firestore.FieldValue.increment(1),
          dormantUsers: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
        
      });

      await db.collection('notifications').add({
        userId: sponsorId,
        title: 'New Referral Joined!',
        message: `${newUser.fullName || 'A new user'} has registered using your referral link.`,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      for(const anc of ancestors) {
         const d = await db.collection('users').doc(anc).get();
         if(d.exists) await updateRankSafely(anc, d.data()!);
      }

    } catch (e) {
      console.error(`Error in processNewUserOnboarding for ${userId}:`, e);
    }
    return null;
  });

// ----------------------------------------------------------------------------
// 4. DATA CONSISTENCY ENGINE (DEEP VALIDATOR & REPAIR)
// ----------------------------------------------------------------------------
export const runDeepDataConsistencyRepair = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth) throw new functions.https.HttpsError('permission-denied', 'Unauthorized');
  const adminDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!adminDoc.exists || (adminDoc.data()?.role !== 'admin' && adminDoc.data()?.role !== 'super_admin')) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can run repair.');
  }

  await performNightlyReconciliation();
  return { success: true, message: "Repair complete" };
});

export const scheduledNightlyReconciliation = functions.pubsub.schedule('0 0 * * 0').onRun(async (context: any) => {
  await performNightlyReconciliation();
  console.log("Weekly global metric reconciliation completed.");
  return null;
});

export const processReconciliationQueue = functions.pubsub.schedule('every 10 minutes').onRun(async (context: any) => {
  const q = await db.collection('reconciliation_queue').limit(1).get();
  if (q.empty) return null;
  
  console.log("Processing reconciliation queue... Running global repair");
  await performNightlyReconciliation();
  
  const queueDocs = await db.collection('reconciliation_queue').get();
  const batchSize = 400;
  let batch = db.batch();
  let count = 0;
  for (const doc of queueDocs.docs) {
    batch.delete(doc.ref);
    count++;
    if (count === batchSize) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }
  if (count > 0) {
    await batch.commit();
  }
  return null;
});

async function performNightlyReconciliation() {
  console.log("Starting Deep Data Consistency & Rebuilding Trees...");
  
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();
  
  const usersMap = new Map();
  for (const doc of snapshot.docs) {
    usersMap.set(doc.id, doc.data());
  }

  const actualCounts = new Map<string, any>();
  
  // 1. Initial State Initialization
  for (const doc of snapshot.docs) {
    initCounts(actualCounts, doc.id);
  }

  // 2. Rebuild True Genealogy Logic using bottom-up traversal
  for (const doc of snapshot.docs) {
    const userData = doc.data();
    const userId = doc.id;
    const isSuspended = userData.activityState === 'suspended' || userData.status === 'archived';
    const isDormant = userData.activityState === 'dormant' && !isSuspended;
    const isActive = userData.activityState === 'active' && !isSuspended;

    if (userData.sponsorId && userData.sponsorId !== 'SYSTEM') {
      let currentId = userData.sponsorId;
      const paths = new Set<string>();
      const ancestorsArray: string[] = [];
      let maxDepth = 1000;
      let depthCounter = 0;
      
      while (currentId && currentId !== 'SYSTEM' && maxDepth > 0) {
        if (paths.has(currentId)) break; // Prevent circular
        paths.add(currentId);
        ancestorsArray.push(currentId);
        
        const upCounts = actualCounts.get(currentId)!;
        
        upCounts.totalDownline++;
        if (isActive) upCounts.activeDownline++;
        if (isDormant) upCounts.dormantDownline++;
        if (isSuspended) upCounts.suspendedDownline++;

        if (depthCounter === 0) {
           // Direct Referral
           upCounts.directReferrals++;
           if (isActive) upCounts.activeReferrals++;
           if (isDormant) upCounts.dormantReferrals++;
           if (isSuspended) upCounts.suspendedReferrals++;
        } else {
           // Indirect Referral
           upCounts.indirectReferrals++;
           if (isActive) upCounts.activeIndirectReferrals++;
           if (isDormant) upCounts.dormantIndirectReferrals++;
           if (isSuspended) upCounts.suspendedIndirectReferrals++;
        }
        
        const parentData = usersMap.get(currentId);
        if (!parentData) break;
        currentId = parentData.sponsorId;
        maxDepth--;
        depthCounter++;
      }
      
      // We will also use actualCounts to cache the expected uplineIds for the user
      const userCached = actualCounts.get(userId)!;
      userCached.uplineIds = ancestorsArray;
    }
  }

  // 3. Apply Reconciled True Values & Rebuild Leaderboards
  const batchSize = 100;
  const updates = Array.from(actualCounts.entries());
  
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = db.batch();
    const chunk = updates.slice(i, i + batchSize);
    
    for (const [userId, counts] of chunk) {
      const uRef = usersRef.doc(userId);
      const userDoc = snapshot.docs.find((d: any) => d.id === userId);
      
      if (userDoc) {
        const uData = userDoc.data();
        let needsUpdate = false;
        const updateObj: any = {};
        
        if (uData.directReferralsCount !== counts.directReferrals) { needsUpdate = true; updateObj.directReferralsCount = counts.directReferrals; }
        if (uData.activeReferralsCount !== counts.activeReferrals) { needsUpdate = true; updateObj.activeReferralsCount = counts.activeReferrals; }
        if (uData.dormantReferralsCount !== counts.dormantReferrals) { needsUpdate = true; updateObj.dormantReferralsCount = counts.dormantReferrals; }
        if (uData.suspendedReferralsCount !== counts.suspendedReferrals) { needsUpdate = true; updateObj.suspendedReferralsCount = counts.suspendedReferrals; }

        if (uData.totalDownlineCount !== counts.totalDownline) { needsUpdate = true; updateObj.totalDownlineCount = counts.totalDownline; }
        if (uData.activeDownlineCount !== counts.activeDownline) { needsUpdate = true; updateObj.activeDownlineCount = counts.activeDownline; }
        if (uData.dormantDownlineCount !== counts.dormantDownline) { needsUpdate = true; updateObj.dormantDownlineCount = counts.dormantDownline; }
        if (uData.suspendedDownlineCount !== counts.suspendedDownline) { needsUpdate = true; updateObj.suspendedDownlineCount = counts.suspendedDownline; }

        if (uData.indirectReferralCount !== counts.indirectReferrals) { needsUpdate = true; updateObj.indirectReferralCount = counts.indirectReferrals; }
        if (uData.activeIndirectReferralCount !== counts.activeIndirectReferrals) { needsUpdate = true; updateObj.activeIndirectReferralCount = counts.activeIndirectReferrals; }
        if (uData.dormantIndirectReferralCount !== counts.dormantIndirectReferrals) { needsUpdate = true; updateObj.dormantIndirectReferralCount = counts.dormantIndirectReferrals; }

        const calculatedScore = (counts.directReferrals * 10) + (counts.indirectReferrals * 3);
        if (uData.leaderboardScore !== calculatedScore) { needsUpdate = true; updateObj.leaderboardScore = calculatedScore; }
        
        // Also update uplineIds
        const currentUplineStr = JSON.stringify(uData.uplineIds || []);
        const newUplineStr = JSON.stringify(counts.uplineIds || []);
        if (currentUplineStr !== newUplineStr) { needsUpdate = true; updateObj.uplineIds = counts.uplineIds || []; }
        
        if (needsUpdate) {
          batch.update(uRef, updateObj);
          batch.set(db.collection('network').doc(userId), updateObj, { merge: true });
        }
      }
    }
    await batch.commit();
  }
  
  // 4. Reconcile Teams accurately (eliminating drift)
  const teamsRef = db.collection('teams');
  const teamSnap = await teamsRef.get();
  
  const teamBatchSize = 100;
  for (let i = 0; i < teamSnap.docs.length; i += teamBatchSize) {
    const batch = db.batch();
    const chunk = teamSnap.docs.slice(i, i + teamBatchSize);
    
    for (const teamDoc of chunk) {
      const teamId = teamDoc.id;
      const teamUsers = snapshot.docs.filter((d: any) => d.data().teamId === teamId);
      
      let totalMembers = 0, activeMembers = 0, dormantMembers = 0, suspendedMembers = 0;
      
      for (const u of teamUsers) {
        const uState = u.data().activityState;
        const uStatus = u.data().status;
        const isSuspended = uState === 'suspended' || uStatus === 'archived';
        
        totalMembers++;
        if (isSuspended) suspendedMembers++;
        else if (uState === 'active') activeMembers++;
        else if (uState === 'dormant') dormantMembers++;
      }
      
      const currentTeamData = teamDoc.data();
      const needsUpdate = 
        currentTeamData.totalMembers !== totalMembers ||
        currentTeamData.activeMembers !== activeMembers ||
        currentTeamData.dormantMembers !== dormantMembers ||
        currentTeamData.suspendedMembers !== suspendedMembers;
        
      if (needsUpdate) {
        batch.update(teamsRef.doc(teamId), {
          totalMembers, activeMembers, dormantMembers, suspendedMembers
        });
      }
    }
    await batch.commit();
  }

  // Rank recalculation after true counts are placed
  for (const doc of snapshot.docs) {
     const upData:any = (await usersRef.doc(doc.id).get()).data();
     await updateRankSafely(doc.id, upData);
  }
}

function initCounts(map: Map<string, any>, userId: string) {
  map.set(userId, {
    directReferrals: 0, activeReferrals: 0, dormantReferrals: 0, suspendedReferrals: 0,
    indirectReferrals: 0, activeIndirectReferrals: 0, dormantIndirectReferrals: 0, suspendedIndirectReferrals: 0,
    totalDownline: 0, activeDownline: 0, dormantDownline: 0, suspendedDownline: 0,
    leaderboardScore: 0, uplineIds: []
  });
}

// ----------------------------------------------------------------------------
// 5. ATOMIC SPONSOR MIGRATION & ACTIVITY ENGINE
// ----------------------------------------------------------------------------
export const handleUserUpdates = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change: any, context: any) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    
    // Protect against recursive updates from self
    if (newData.isMigratingSponsor) return null;

    if (newData.status === 'archived') newData.activityState = 'suspended';

    let newCalculatedState = newData.activityState;
    let activityStateChanged = false;

    if (newData.status !== 'archived' && newData.activityState !== 'suspended') {
       const directRefs = newData.directReferralsCount || 0;
       newCalculatedState = directRefs >= 3 ? 'active' : 'dormant';
    } else {
       newCalculatedState = 'suspended';
    }

    if (newData.activityState !== newCalculatedState) {
       await change.after.ref.update({ activityState: newCalculatedState });
       newData.activityState = newCalculatedState; 
    }

    if (newData.activityState !== oldData.activityState) activityStateChanged = true;
    
    const sponsorChanged = newData.sponsorId !== oldData.sponsorId;
    const teamChanged = newData.teamId !== oldData.teamId;

    if (sponsorChanged) {
        console.log(`Sponsor Migration triggered for ${context.params.userId}. Queuing...`);
        await db.collection('reconciliation_queue').add({ userId: context.params.userId, type: 'sponsor_change', timestamp: admin.firestore.FieldValue.serverTimestamp() });
    } else {
        if (activityStateChanged || teamChanged) {
           await db.collection('reconciliation_queue').add({ userId: context.params.userId, type: 'activity_change', timestamp: admin.firestore.FieldValue.serverTimestamp() });
        }
    }
    
    if (activityStateChanged && newCalculatedState === 'active' && oldData.activityState !== 'active') {
        await db.collection('notifications').add({
          userId: context.params.userId,
          title: 'Activity Status Update',
          message: 'Congratulations! You are now an Active Member.',
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    return null;
  });

// ----------------------------------------------------------------------------
// 6. ENTERPRISE SOFT DELETION
// ----------------------------------------------------------------------------
export const processTeamDeletion = functions.firestore
  .document('teams/{teamId}')
  .onUpdate(async (change: any, context: any) => {
    const teamId = context.params.teamId;
    const newData = change.after.data();
    const oldData = change.before.data();
    
    if (newData.status !== 'deleted' || oldData.status === 'deleted') return null;
    
    try {
      const usersQuery = await db.collection('users').where('teamId', '==', teamId).get();
      const userIdsToUpdate = new Set<string>();
      usersQuery.forEach((doc: any) => userIdsToUpdate.add(doc.id));
      if (oldData.teamLeaderId) userIdsToUpdate.add(oldData.teamLeaderId);
      
      const batchSize = 250;
      const idsArray = Array.from(userIdsToUpdate);
      
      for (let i = 0; i < idsArray.length; i += batchSize) {
        const chunk = idsArray.slice(i, i + batchSize);
        const batch = db.batch();
        
        for (const id of chunk) {
          const updates: any = { teamId: 'SYSTEM' };
          if (id === oldData.teamLeaderId) updates.roleType = 'team_member'; 
          batch.update(db.collection('users').doc(id), updates);
        }
        await batch.commit();
      }
      await db.collection('teams').doc(teamId).delete();
      
      // Add to queue for drift repair instead of direct call
      await db.collection('reconciliation_queue').add({ type: 'team_deleted', teamId, timestamp: admin.firestore.FieldValue.serverTimestamp() });
      
    } catch (e) {
      console.error(`Error cleaning up after deleting team ${teamId}`, e);
    }
    return null;
  });

export const onUserDeleted = functions.firestore
  .document('users/{userId}')
  .onDelete(async (snap: any, context: any) => {
    const userId = context.params.userId;
    try {
      await admin.auth().deleteUser(userId);
    } catch (e: any) {
      if (e.code !== 'auth/user-not-found') console.error("Error deleting auth user", userId, e);
    }
    
    try {
      await db.collection('network').doc(userId).delete();
      await db.collection('reconciliation_queue').add({ userId, type: 'user_deleted', timestamp: admin.firestore.FieldValue.serverTimestamp() });
    } catch (e: any) {
      console.error("Error deleting network doc", userId, e);
    }
    return null;
  });

// ----------------------------------------------------------------------------
// END OF ENTERPRISE MLM FUNCTIONS
// ----------------------------------------------------------------------------
