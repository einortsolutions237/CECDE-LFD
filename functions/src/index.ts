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
export function calculateRank(userData: any, rankSettings: any = null): string {
  const directs = userData.directReferralsCount || 0;
  const downline = userData.totalDownlineCount || 0;
  const activeReferrals = userData.activeReferralsCount || 0; 
  const activeDownline = userData.activeDownlineCount || 0;

  if (rankSettings) {
    // Sort ranks by some criteria (e.g., highest requirement first)
    // Assume rankSettings is an array or object configured by admin
    // For safety, fallback to hardcoded if not present or correctly formatted
    const ranks = Object.keys(rankSettings).sort((a,b) => (rankSettings[b].minDirect || 0) - (rankSettings[a].minDirect || 0));
    for (const rank of ranks) {
      const criteria = rankSettings[rank];
      if (directs >= (criteria.minDirect || 0) &&
          downline >= (criteria.minTeamSize || 0) &&
          activeReferrals >= (criteria.minActiveDirect || 0) &&
          activeDownline >= (criteria.minActiveTeam || 0)) {
        return rank;
      }
    }
  }

  // Fallback backward compatible
  if (directs >= 20 && downline >= 1000 && activeDownline >= 100) return 'Crown Ambassador';
  if (directs >= 15 && downline >= 500 && activeDownline >= 50) return 'Diamond';
  if (directs >= 10 && downline >= 100 && activeDownline >= 25) return 'Platinum';
  if (directs >= 8 && downline >= 50 && activeDownline >= 15) return 'Gold';
  if (directs >= 5 && downline >= 20 && activeReferrals >= 5) return 'Silver';
  if (directs >= 3 && downline >= 5 && activeReferrals >= 2) return 'Bronze';
  
  return 'Member';
}

async function updateRankSafely(userId: string, currentData: any, transaction?: admin.firestore.Transaction, rankSettings?: any) {
  const calculatedRank = calculateRank(currentData, rankSettings);
  if (currentData.currentRank !== calculatedRank) {
    const uRef = db.collection('users').doc(userId);
    if (transaction) {
      transaction.update(uRef, { currentRank: calculatedRank });
    } else {
      await uRef.update({ currentRank: calculatedRank });
    }
    
    const rankOrder = ['Member', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Crown Ambassador'];
    const isUpgrade = rankOrder.indexOf(calculatedRank) > rankOrder.indexOf(currentData.currentRank || 'Member');
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

// Helper to determine teamId explicitly during one-off writes
async function getEffectiveTeamId(ancestors: string[]): Promise<string> {
   for (const ancId of ancestors) {
      const doc = await db.collection('users').doc(ancId).get();
      if (doc.exists && doc.data()?.roleType === 'team_leader') {
         return ancId;
      }
   }
   return 'SYSTEM';
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
      const effectiveTeamId = await getEffectiveTeamId(ancestors);
      
      await db.runTransaction(async (transaction: any) => {
        const uRef = db.collection('users').doc(userId);
        const sponsorRef = db.collection('users').doc(sponsorId);
        
        const sponsorDoc = await transaction.get(sponsorRef);
        if(!sponsorDoc.exists) throw new Error("Sponsor not found");
        const sponsorData = sponsorDoc.data()!;

        if (sponsorData.status === 'suspended' || sponsorData.activityState === 'suspended' || sponsorData.status === 'archived') {
          throw new Error('Sponsor is suspended or inactive.');
        }

        let newSponsorRoleType = sponsorData.roleType;
        const currentDirects = sponsorData.directReferralsCount || 0;
        const newDirectsCount = currentDirects + 1;

        if (newDirectsCount >= 5 && sponsorData.roleType !== 'team_leader' && sponsorData.roleType !== 'admin') {
          newSponsorRoleType = 'team_leader';
        }

        const actualTeamId = (newSponsorRoleType === 'team_leader' && sponsorId === effectiveTeamId) ? sponsorId : effectiveTeamId;

        // Initialize user
        transaction.update(uRef, {
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
          uplineIds: ancestors,
          networkDepth: ancestors.length,
          
          migrationStatus: 'idle'
        });

        const netRef = db.collection('network').doc(userId);
        transaction.set(netRef, {
           uid: userId, 
           directReferrals: [],
           uplineIds: ancestors,
           teamId: actualTeamId
        });

        // Update immediately sponsor (Direct)
        transaction.update(sponsorRef, {
          directReferralsCount: newDirectsCount,
          dormantReferralsCount: admin.firestore.FieldValue.increment(1),
          totalDownlineCount: admin.firestore.FieldValue.increment(1),
          dormantDownlineCount: admin.firestore.FieldValue.increment(1),
          leaderboardScore: admin.firestore.FieldValue.increment(10),
          roleType: newSponsorRoleType
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

      const settingsDoc = await db.collection('system_settings').doc('ranks').get();
      const rankSettings = settingsDoc.exists ? settingsDoc.data() : null;

      for(const anc of ancestors) {
         const d = await db.collection('users').doc(anc).get();
         if(d.exists) await updateRankSafely(anc, d.data()!, undefined, rankSettings);
      }

      await recalculateTeamMetrics();

    } catch (e) {
      console.error(`Error in processNewUserOnboarding for ${userId}:`, e);
    }
    return null;
  });

// ----------------------------------------------------------------------------
// 4. ATOMIC SPONSOR MIGRATION ENGINE
// ----------------------------------------------------------------------------
export const migrateSponsorAtomic = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth) throw new functions.https.HttpsError('permission-denied', 'Unauthorized');
  const adminDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!adminDoc.exists || (adminDoc.data()?.role !== 'admin' && adminDoc.data()?.role !== 'super_admin')) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can migrate sponsors.');
  }

  const { uid, newSponsorId } = data;
  if (!uid || !newSponsorId) throw new functions.https.HttpsError('invalid-argument', 'Missing parameters');

  const uRef = db.collection('users').doc(uid);
  
  await db.runTransaction(async (t) => {
    const userDoc = await t.get(uRef);
    if (!userDoc.exists) throw new functions.https.HttpsError('not-found', 'User not found');
    const uData = userDoc.data()!;
    if (uData.migrationStatus === 'processing') {
      throw new functions.https.HttpsError('failed-precondition', 'Migration already in progress');
    }
    t.update(uRef, { migrationStatus: 'processing' });
  });

  try {
    const newAncestors = await getAncestorPath(newSponsorId);
    if (newAncestors.includes(uid)) {
       throw new Error("Cannot migrate sponsor: circular hierarchy detected (new sponsor is within the downline)");
    }
    const 
    
    await uRef.update({ 
       sponsorId: newSponsorId,
       uplineIds: newAncestors,
       networkDepth: newAncestors.length,
       
       updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const descSnapshot = await db.collection('users').where('uplineIds', 'array-contains', uid).get();
    const batch = db.batch();
    descSnapshot.docs.forEach((doc) => {
       batch.update(doc.ref, { migrationStatus: 'processing_descendant' });
    });
    await batch.commit();

    await repairChangedUsers(); 

    await uRef.update({ migrationStatus: 'idle' });

    await recalculateTeamMetrics();

    return { success: true };
  } catch (error: any) {
    console.error("Migration failed, rolling back...", error);
    await uRef.update({ migrationStatus: 'idle' });
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ----------------------------------------------------------------------------
// 5. DATA CONSISTENCY ENGINE (SMART RECONCILIATION)
// ----------------------------------------------------------------------------
export const runDeepDataConsistencyRepair = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth) throw new functions.https.HttpsError('permission-denied', 'Unauthorized');
  const adminDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!adminDoc.exists || (adminDoc.data()?.role !== 'admin' && adminDoc.data()?.role !== 'super_admin')) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can run repair.');
  }

  const mode = data.mode || 'smart'; // 'smart' or 'full'
  if (mode === 'full') {
     await performNightlyReconciliation(true);
  } else {
     await repairChangedUsers();
  }
  
  return { success: true, message: "Repair complete" };
});

export const scheduledNightlyReconciliation = functions.pubsub.schedule('every 24 hours').onRun(async (context: any) => {
  const day = new Date().getDay();
  if (day === 0) {
    await performNightlyReconciliation(true);
  } else {
    await repairChangedUsers();
  }
  console.log("Nightly metric reconciliation completed.");
  return null;
});

async function repairChangedUsers() {
  const queueSnap = await db.collection('changedUsersQueue').limit(1000).get();
  if (queueSnap.empty) return;
  
  const affectedUsers = new Set<string>();
  const deleteBatch = db.batch();
  
  for (const doc of queueSnap.docs) {
    const data = doc.data();
    if (data.userId) affectedUsers.add(data.userId);
    if (data.uplineIds && Array.isArray(data.uplineIds)) {
       data.uplineIds.forEach((id: string) => affectedUsers.add(id));
    }
    deleteBatch.delete(doc.ref);
  }
  
  const settingsDoc = await db.collection('system_settings').doc('ranks').get();
  const rankSettings = settingsDoc.exists ? settingsDoc.data() : null;
  
  const usersToUpdate = Array.from(affectedUsers);
  
  // Chunking
  const chunkSize = 10;
  for(let i=0; i < usersToUpdate.length; i += chunkSize) {
     const chunk = usersToUpdate.slice(i, i + chunkSize);
     await Promise.all(chunk.map(async (uId) => {
        const directsSnap = await db.collection('users').where('sponsorId', '==', uId).get();
        const downlineSnap = await db.collection('users').where('uplineIds', 'array-contains', uId).get();
        
        let directReferrals = 0, activeReferrals = 0, dormantReferrals = 0, suspendedReferrals = 0;
        directsSnap.forEach(d => {
           directReferrals++;
           const state = d.data().activityState;
           if (state === 'active') activeReferrals++;
           if (state === 'dormant') dormantReferrals++;
           if (state === 'suspended' || d.data().status === 'archived') suspendedReferrals++;
        });
        
        let totalDownline = 0, activeDownline = 0, dormantDownline = 0, suspendedDownline = 0;
        downlineSnap.forEach(d => {
           totalDownline++;
           const state = d.data().activityState;
           if (state === 'active') activeDownline++;
           if (state === 'dormant') dormantDownline++;
           if (state === 'suspended' || d.data().status === 'archived') suspendedDownline++;
        });
        
        const indirectReferrals = totalDownline - directReferrals;
        // activeIndirectReferrals etc can be calculated easily
        
        const updateObj = {
           directReferralsCount: directReferrals,
           activeReferralsCount: activeReferrals,
           dormantReferralsCount: dormantReferrals,
           suspendedReferralsCount: suspendedReferrals,
           totalDownlineCount: totalDownline,
           activeDownlineCount: activeDownline,
           dormantDownlineCount: dormantDownline,
           suspendedDownlineCount: suspendedDownline,
           indirectReferralCount: indirectReferrals,
           leaderboardScore: (directReferrals * 10) + (indirectReferrals * 3)
        };
        
        const uRef = db.collection('users').doc(uId);
        await uRef.update(updateObj);
        
        const uDoc = await uRef.get();
        if (uDoc.exists) {
           await updateRankSafely(uId, uDoc.data()!, undefined, rankSettings);
        }
     }));
  }
  
  await deleteBatch.commit();
}

async function performNightlyReconciliation(fullRebuild: boolean = true) {
  console.log("Starting Enterprise Rebuild...");
  
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();
  
  const usersMap = new Map();
  for (const doc of snapshot.docs) {
    usersMap.set(doc.id, doc.data());
  }

  const actualCounts = new Map<string, any>();
  for (const doc of snapshot.docs) {
    initCounts(actualCounts, doc.id);
  }

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
        if (paths.has(currentId)) break; 
        paths.add(currentId);
        ancestorsArray.push(currentId);
        
        const upCounts = actualCounts.get(currentId);
        if (upCounts) {
           upCounts.totalDownline++;
           if (isActive) upCounts.activeDownline++;
           if (isDormant) upCounts.dormantDownline++;
           if (isSuspended) upCounts.suspendedDownline++;

           if (depthCounter === 0) {
              upCounts.directReferrals++;
              if (isActive) upCounts.activeReferrals++;
              if (isDormant) upCounts.dormantReferrals++;
              if (isSuspended) upCounts.suspendedReferrals++;
           } else {
              upCounts.indirectReferrals++;
              if (isActive) upCounts.activeIndirectReferrals++;
              if (isDormant) upCounts.dormantIndirectReferrals++;
              if (isSuspended) upCounts.suspendedIndirectReferrals++;
           }
        }
        
        const parentData = usersMap.get(currentId);
        if (!parentData) break;

        // TRUE GENEALOGY TEAM RESOLUTION
        

        currentId = parentData.sponsorId;
        maxDepth--;
        depthCounter++;
      }
      
      const userCached = actualCounts.get(userId);
      if (userCached) {
        userCached.uplineIds = ancestorsArray;
        
      }
    }
  }

  const batchSize = 100;
  const updates = Array.from(actualCounts.entries());
  
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = db.batch();
    const chunk = updates.slice(i, i + batchSize);
    
    for (const [userId, counts] of chunk) {
      const uRef = usersRef.doc(userId);
      const uData = usersMap.get(userId);
      
      if (uData) {
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
        
        const currentUplineStr = JSON.stringify(uData.uplineIds || []);
        const newUplineStr = JSON.stringify(counts.uplineIds || []);
        if (currentUplineStr !== newUplineStr) { needsUpdate = true; updateObj.uplineIds = counts.uplineIds || []; updateObj.networkDepth = (counts.uplineIds || []).length; }

        
        
        if (uData.migrationStatus === 'processing_descendant' || uData.migrationStatus === 'processing') {
           needsUpdate = true;
           updateObj.migrationStatus = 'idle';
        }

        if (needsUpdate) {
          batch.update(uRef, updateObj);
        }
      }
    }
    await batch.commit();
  }
  
  await recalculateTeamMetrics();

  const settingsDoc = await db.collection('system_settings').doc('ranks').get();
  const rankSettings = settingsDoc.exists ? settingsDoc.data() : null;

  for (const [userId, uData] of Array.from(usersMap.entries())) {
     const upCounts = actualCounts.get(userId);
     if (upCounts) {
       const freshData = { ...uData, ...upCounts };
       await updateRankSafely(userId, freshData, undefined, rankSettings);
     }
  }
}

// ----------------------------------------------------------------------------
// 6. TRUE GENEALOGY TEAM METRICS (No longer reliant on teamId)
// ----------------------------------------------------------------------------
export const triggerTeamRecalculation = functions.https.onCall(async (data: any, context: any) => {
   if (!context.auth) throw new functions.https.HttpsError('permission-denied', 'Unauthorized');
   await recalculateTeamMetrics();
   return { success: true };
});

async function recalculateTeamMetrics() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();
  
  const usersMap = new Map();
  for (const doc of snapshot.docs) {
    usersMap.set(doc.id, doc.data());
  }

  const teamsRef = db.collection('teams');
  const teamSnap = await teamsRef.get();
  
  const teamBatchSize = 100;
  for (let i = 0; i < teamSnap.docs.length; i += teamBatchSize) {
    const batch = db.batch();
    const chunk = teamSnap.docs.slice(i, i + teamBatchSize);
    
    for (const teamDoc of chunk) {
      const teamId = teamDoc.id;
      const tData = teamDoc.data();
      const teamLeaderId = tData.teamLeaderId;
      
      const teamUsers = snapshot.docs.filter((d: any) => {
         const uData = d.data();
         return uData.uplineIds && Array.isArray(uData.uplineIds) && uData.uplineIds.includes(teamLeaderId);
      });
      
      let totalMembers = 0, activeMembers = 0, dormantMembers = 0, suspendedMembers = 0;
      let directReferrals = 0, indirectReferrals = 0;
      
      for (const u of teamUsers) {
        const uState = u.data().activityState;
        const uStatus = u.data().status;
        const sponsorId = u.data().sponsorId;
        const isSuspended = uState === 'suspended' || uStatus === 'archived';
        
        totalMembers++;
        if (isSuspended) suspendedMembers++;
        else if (uState === 'active') activeMembers++;
        else if (uState === 'dormant') dormantMembers++;
        
        if (sponsorId === teamLeaderId) {
          directReferrals++;
        } else {
          indirectReferrals++;
        }
      }
      
      const needsUpdate = 
        tData.totalMembers !== (totalMembers + 1) ||
        tData.activeMembers !== activeMembers ||
        tData.dormantMembers !== dormantMembers ||
        tData.suspendedMembers !== suspendedMembers ||
        tData.leaderDirectReferralsCount !== directReferrals ||
        tData.leaderIndirectReferralsCount !== indirectReferrals;
        
      if (needsUpdate) {
        batch.update(teamsRef.doc(teamId), {
          totalMembers: totalMembers + 1,
          activeMembers, 
          dormantMembers, 
          suspendedMembers,
          leaderDirectReferralsCount: directReferrals,
          leaderIndirectReferralsCount: indirectReferrals,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    await batch.commit();
  }
}

function initCounts(map: Map<string, any>, userId: string) {
  map.set(userId, {
    directReferrals: 0, activeReferrals: 0, dormantReferrals: 0, suspendedReferrals: 0,
    indirectReferrals: 0, activeIndirectReferrals: 0, dormantIndirectReferrals: 0, suspendedIndirectReferrals: 0,
    totalDownline: 0, activeDownline: 0, dormantDownline: 0, suspendedDownline: 0,
    leaderboardScore: 0, uplineIds: [], 
  });
}

// ----------------------------------------------------------------------------
// 7. ACTIVITY ENGINE
// ----------------------------------------------------------------------------
export const handleUserUpdates = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change: any, context: any) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    
    if (newData.migrationStatus === 'processing' || newData.migrationStatus === 'processing_descendant') return null;

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
    
    if (activityStateChanged) {
        await db.collection('changedUsersQueue').add({
           userId: context.params.userId,
           uplineIds: newData.uplineIds || [],
           timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
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
// 9. FINAL CONSISTENCY VALIDATOR
// ----------------------------------------------------------------------------
export const validateSystemIntegrity = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth) throw new functions.https.HttpsError('permission-denied', 'Unauthorized');
  const adminDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!adminDoc.exists || (adminDoc.data()?.role !== 'admin' && adminDoc.data()?.role !== 'super_admin')) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can run repair.');
  }

  // Trigger full repair fallback inside a background worker or handle inline if small.
  // For safety and timeout limits, we perform a smart queue dispatch for everyone.
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();
  
  let validCount = 0;
  let corruptedCount = 0;
  
  const batch = db.batch();
  let opCount = 0;
  const commitSync = async () => { if (opCount > 0) { await batch.commit(); opCount = 0; } };

  snapshot.docs.forEach(doc => {
     const ref = db.collection('changedUsersQueue').doc();
     batch.set(ref, {
         userId: doc.id,
         uplineIds: doc.data().uplineIds || [],
         timestamp: admin.firestore.FieldValue.serverTimestamp()
     });
     opCount++;
     corruptedCount++;
  });
  
  await commitSync();
  await repairChangedUsers();

  return { success: true, message: `System Integrity Check Triggered. Requeued ${corruptedCount} users.` };
});

export const processTeamDeletion = functions.firestore
  .document('teams/{teamId}')
  .onUpdate(async (change: any, context: any) => {
    const teamId = context.params.teamId;
    const newData = change.after.data();
    const oldData = change.before.data();
    
    if (newData.status !== 'deleted' || oldData.status === 'deleted') return null;
    
    try {
      if (oldData.teamLeaderId) {
         await db.collection('users').doc(oldData.teamLeaderId).update({ roleType: 'team_member' });
      }
      
      await db.collection('teams').doc(teamId).delete();
      
      await performNightlyReconciliation(false);
      
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
      await performNightlyReconciliation(false);
    } catch (e: any) {
      console.error("Error deleting network doc", userId, e);
    }
    return null;
  });