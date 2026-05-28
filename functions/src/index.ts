import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

// ----------------------------------------------------------------------------
// 1. CENTRALIZED RANKING ENGINE
// ----------------------------------------------------------------------------
export function calculateRank(userData: any): string {
  const directs = userData.directReferralsCount || 0;
  const downline = userData.totalDownlineCount || 0;
  const activeReferrals = userData.activeReferralsCount || 0; 
  const activeDownline = userData.activeDownlineCount || 0;

  // Fair, leadership-oriented requirements
  if (directs >= 20 && downline >= 1000 && activeDownline >= 100) return 'Crown Ambassador';
  if (directs >= 15 && downline >= 500 && activeDownline >= 50) return 'Diamond';
  if (directs >= 10 && downline >= 100 && activeDownline >= 25) return 'Platinum';
  if (directs >= 8 && downline >= 50 && activeDownline >= 15) return 'Gold';
  if (directs >= 5 && downline >= 20 && activeReferrals >= 5) return 'Silver';
  if (directs >= 3 && downline >= 5 && activeReferrals >= 2) return 'Bronze';
  
  return 'Member';
}

async function updateRankSafely(userId: string, currentData: any, transaction?: admin.firestore.Transaction) {
  const calculatedRank = calculateRank(currentData);
  if (currentData.currentRank !== calculatedRank) {
    const uRef = db.collection('users').doc(userId);
    if (transaction) {
      transaction.update(uRef, { currentRank: calculatedRank });
    } else {
      await uRef.update({ currentRank: calculatedRank });
    }
    
    // Notification logic
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
// 2. HIERARCHY VALIDATOR
// ----------------------------------------------------------------------------
async function validateSponsorHierarchy(newUserId: string, sponsorId: string | null, transaction: admin.firestore.Transaction): Promise<any> {
  if (!sponsorId || sponsorId === 'SYSTEM') return null;
  if (newUserId === sponsorId) throw new Error("Cannot sponsor oneself.");

  const sponsorRef = db.collection('users').doc(sponsorId);
  const sponsorDoc = await transaction.get(sponsorRef);
  
  if (!sponsorDoc.exists) throw new Error("Sponsor does not exist.");
  const sponsorData = sponsorDoc.data()!;
  
  if (sponsorData.status === 'suspended' || sponsorData.activityState === 'suspended' || sponsorData.status === 'archived') {
    throw new Error('Sponsor is suspended or inactive and cannot recruit.');
  }

  // Prevent circular hierarchy
  let currentId = sponsorId;
  const paths = new Set<string>();
  
  for (let i = 0; i < 50; i++) {
    if (!currentId || currentId === 'SYSTEM') break;
    if (currentId === newUserId) {
      throw new Error(`Circular hierarchy detected: User ${newUserId} is already in the upline of ${sponsorId}`);
    }
    if (paths.has(currentId)) {
      throw new Error(`Corrupted hierarchy: Loop detected at ${currentId}`);
    }
    paths.add(currentId);
    
    const parentDoc = await transaction.get(db.collection('users').doc(currentId));
    if (!parentDoc.exists) break;
    currentId = parentDoc.data()?.sponsorId;
  }
  
  return sponsorData;
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
      await db.runTransaction(async (transaction: any) => {
        const uRef = db.collection('users').doc(userId);
        const sponsorRef = db.collection('users').doc(sponsorId);
        
        const sponsorData = await validateSponsorHierarchy(userId, sponsorId, transaction);

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

        // Sponsor updates
        transaction.update(sponsorRef, {
          directReferralsCount: newDirectsCount,
          dormantReferralsCount: admin.firestore.FieldValue.increment(1),
          roleType: newSponsorRoleType,
          teamId: newSponsorRoleType === 'team_leader' ? sponsorId : (sponsorData.teamId || 'SYSTEM')
        });

        // Initialize user
        transaction.update(uRef, {
          teamId: newTeamId,
          roleType: newUser.roleType === 'admin' ? 'admin' : 'team_member',
          activityState: 'dormant',
          status: 'active', // overall account status
          currentRank: 'Member',
          directReferralsCount: 0,
          activeReferralsCount: 0,
          dormantReferralsCount: 0,
          suspendedReferralsCount: 0,
          totalDownlineCount: 0,
          activeDownlineCount: 0,
          dormantDownlineCount: 0,
          suspendedDownlineCount: 0,
          walletBalance: 0,
        });

        // Update Sponsor Network Metrics
        const sponsorNetworkRef = db.collection('network').doc(sponsorId);
        const sponsorNetworkDoc = await transaction.get(sponsorNetworkRef);
        if (sponsorNetworkDoc.exists) {
          transaction.update(sponsorNetworkRef, {
            directReferrals: admin.firestore.FieldValue.arrayUnion(userId)
          });
        } else {
          transaction.set(sponsorNetworkRef, {
            uid: sponsorId,
            directReferrals: [userId]
            // downline counts will be set by propagateAncestryUpdatesSafely
          });
        }

        // Team Metrics
        if (newTeamId && newTeamId !== 'SYSTEM') {
          const teamRef = db.collection('teams').doc(newTeamId);
          const teamDoc = await transaction.get(teamRef);
          const isDirectForTeam = (newTeamId === sponsorId);

          if (teamDoc.exists) {
             const teamUpdates: any = {
               totalMembers: admin.firestore.FieldValue.increment(1),
               dormantMembers: admin.firestore.FieldValue.increment(1)
             };
             if (isDirectForTeam) {
               teamUpdates.leaderDirectReferralsCount = admin.firestore.FieldValue.increment(1);
             }
             transaction.update(teamRef, teamUpdates);
          } else if (newSponsorRoleType === 'team_leader' && newTeamId === sponsorId) {
             transaction.set(teamRef, {
               teamLeaderId: sponsorId,
               teamLeaderName: sponsorData.fullName || 'Team Leader',
               status: 'active',
               totalMembers: 1, // Start with this new member
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

      // Safe Network Propagation triggered after full transaction success
      await propagateAncestryUpdatesSafely(sponsorId, 1, 0, 1);

      await db.collection('notifications').add({
        userId: sponsorId,
        title: 'New Referral Joined!',
        message: `${newUser.fullName || 'A new user'} has registered using your referral link.`,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

    } catch (e) {
      console.error(`Error in processNewUserOnboarding for ${userId}:`, e);
      // Let it fail safely. Client side can notify appropriately.
    }
    return null;
  });

// ----------------------------------------------------------------------------
// 4. SAFE NETWORK PROPAGATION LOGIC
// ----------------------------------------------------------------------------
async function propagateAncestryUpdatesSafely(
  sponsorId: string, 
  totalDiff: number, 
  activeDiff: number, 
  dormantDiff: number,
  suspendedDiff: number = 0
) {
  let currentId = sponsorId;
  const sponsorPaths: string[] = [];
  const maxLevels = 50;
  
  // Track ancestry to prevent circular loops
  for (let i = 0; i < maxLevels; i++) {
    if (!currentId || currentId === 'SYSTEM') break;
    if (sponsorPaths.includes(currentId)) {
      console.error(`Circular hierarchy detected at ${currentId} during propagation`);
      break;
    }
    
    sponsorPaths.push(currentId);
    const parentDoc = await db.collection('users').doc(currentId).get();
    if (!parentDoc.exists) break;
    currentId = parentDoc.data()?.sponsorId;
  }

  if (sponsorPaths.length === 0) return;
  
  // Batch aggregate updates for scalability
  const batchSize = 100;
  for (let i = 0; i < sponsorPaths.length; i += batchSize) {
    const batch = db.batch();
    const currentChunk = sponsorPaths.slice(i, i + batchSize);

    for (const sId of currentChunk) {
      const uRef = db.collection('users').doc(sId);
      const netRef = db.collection('network').doc(sId);
      
      const updates: any = {};
      if (totalDiff !== 0) updates.totalDownlineCount = admin.firestore.FieldValue.increment(totalDiff);
      if (activeDiff !== 0) updates.activeDownlineCount = admin.firestore.FieldValue.increment(activeDiff);
      if (dormantDiff !== 0) updates.dormantDownlineCount = admin.firestore.FieldValue.increment(dormantDiff);
      if (suspendedDiff !== 0) updates.suspendedDownlineCount = admin.firestore.FieldValue.increment(suspendedDiff);
      
      if (Object.keys(updates).length > 0) {
        batch.update(uRef, updates);
        batch.set(netRef, updates, { merge: true });
      }
    }
    await batch.commit();
  }

  // Rank Check for hierarchy changes
  for (const sId of sponsorPaths) {
     const docSnap = await db.collection('users').doc(sId).get();
     if(docSnap.exists) {
        await updateRankSafely(sId, docSnap.data());
     }
  }
}

// ----------------------------------------------------------------------------
// 5. UNIFIED ACTIVITY STATE MANAGER & METRIC NORMALIZATION
// ----------------------------------------------------------------------------
export const handleUserUpdates = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change: any, context: any) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    
    // NORMALIZE STATUS: If the account is archived, activity state MUST be suspended
    if (newData.status === 'archived') {
      newData.activityState = 'suspended';
    }

    let newCalculatedState = newData.activityState;
    let activityStateChanged = false;

    // Calculate dynamic state if neither suspended nor archived
    if (newData.status !== 'archived' && newData.activityState !== 'suspended') {
       const directRefs = newData.directReferralsCount || 0;
       newCalculatedState = directRefs >= 3 ? 'active' : 'dormant';
    } else {
       newCalculatedState = 'suspended'; // Ensure terminal state matches
    }

    // Force update if the state organically changed
    if (newData.activityState !== newCalculatedState) {
       await change.after.ref.update({ activityState: newCalculatedState });
       newData.activityState = newCalculatedState; 
    }

    if (newData.activityState !== oldData.activityState) {
       activityStateChanged = true;
    }
    
    const sponsorChanged = newData.sponsorId !== oldData.sponsorId;
    const teamChanged = newData.teamId !== oldData.teamId;

    if (activityStateChanged || sponsorChanged || teamChanged) {
       const nextState = newData.activityState;
       const oldState = oldData.activityState;

       const statsRef = db.collection('system_stats').doc('global');
       
       let diffActive = 0, diffDormant = 0, diffSuspended = 0, diffTotal = 0;
       
       if (activityStateChanged) {
         if (nextState === 'active') diffActive = 1;
         else if (oldState === 'active') diffActive = -1;
         
         if (nextState === 'dormant') diffDormant = 1;
         else if (oldState === 'dormant') diffDormant = -1;
         
         if (nextState === 'suspended') diffSuspended = 1;
         else if (oldState === 'suspended') diffSuspended = -1;

         // totalUsers remains unaffected by suspend per Enterprise logic
       }
       
       // Handle System Stats
       if (activityStateChanged) {
         const systemUpdates: any = {
           activeUsers: admin.firestore.FieldValue.increment(diffActive),
           dormantUsers: admin.firestore.FieldValue.increment(diffDormant),
           suspendedUsers: admin.firestore.FieldValue.increment(diffSuspended)
         };
         if (diffTotal !== 0) systemUpdates.totalUsers = admin.firestore.FieldValue.increment(diffTotal);
         await statsRef.set(systemUpdates, { merge: true });
       }
       
       // -------------------------------------------------------------------
       // TEAM PROPAGATION
       // -------------------------------------------------------------------
       if (teamChanged) {
          // Remove from old team safely
          if (oldData.teamId && oldData.teamId !== 'SYSTEM') {
             const oldActive = oldState === 'active' ? -1 : 0;
             const oldDorm = oldState === 'dormant' ? -1 : 0;
             const oldSusp = oldState === 'suspended' ? -1 : 0;
             const oldTot = -1; // They left the team completely
             await db.collection('teams').doc(oldData.teamId).update({
               totalMembers: admin.firestore.FieldValue.increment(oldTot),
               activeMembers: admin.firestore.FieldValue.increment(oldActive),
               dormantMembers: admin.firestore.FieldValue.increment(oldDorm),
               suspendedMembers: admin.firestore.FieldValue.increment(oldSusp)
             }).catch((e: any) => { if (e.code !== 5 && e.code !== 'not-found') console.error("Old Team update error", e); });
          }
          // Add to new team
          if (newData.teamId && newData.teamId !== 'SYSTEM') {
             const newActive = nextState === 'active' ? 1 : 0;
             const newDorm = nextState === 'dormant' ? 1 : 0;
             const newSusp = nextState === 'suspended' ? 1 : 0;
             const newTot = 1; 
             await db.collection('teams').doc(newData.teamId).update({
               totalMembers: admin.firestore.FieldValue.increment(newTot),
               activeMembers: admin.firestore.FieldValue.increment(newActive),
               dormantMembers: admin.firestore.FieldValue.increment(newDorm),
               suspendedMembers: admin.firestore.FieldValue.increment(newSusp)
             }).catch((e: any) => { if (e.code !== 5 && e.code !== 'not-found') console.error("New Team update error", e); });
          }
       } else if (activityStateChanged && newData.teamId && newData.teamId !== 'SYSTEM') {
          // Only State changed within same team
          await db.collection('teams').doc(newData.teamId).update({
            activeMembers: admin.firestore.FieldValue.increment(diffActive),
            dormantMembers: admin.firestore.FieldValue.increment(diffDormant),
            suspendedMembers: admin.firestore.FieldValue.increment(diffSuspended)
          }).catch((e: any) => { if (e.code !== 5 && e.code !== 'not-found') console.error("Team update error", e); });
       }

       // -------------------------------------------------------------------
       // SPONSOR AND UPLINE (NETWORK) PROPAGATION
       // -------------------------------------------------------------------
       if (sponsorChanged) {
           if (oldData.sponsorId && oldData.sponsorId !== 'SYSTEM') {
               const oldSpRef = db.collection('users').doc(oldData.sponsorId);
               await oldSpRef.update({
                 directReferralsCount: admin.firestore.FieldValue.increment(-1), // total changes only on sponsor change
                 activeReferralsCount: admin.firestore.FieldValue.increment(oldState === 'active' ? -1 : 0),
                 dormantReferralsCount: admin.firestore.FieldValue.increment(oldState === 'dormant' ? -1 : 0),
                 suspendedReferralsCount: admin.firestore.FieldValue.increment(oldState === 'suspended' ? -1 : 0),
               });
               
               const netRef = db.collection('network').doc(oldData.sponsorId);
               await netRef.update({
                  directReferrals: admin.firestore.FieldValue.arrayRemove(context.params.userId)
               }).catch(()=>{});

               await propagateAncestryUpdatesSafely(
                  oldData.sponsorId, 
                  -1 - (oldData.totalDownlineCount || 0), // total downline leaves
                  (oldState === 'active' ? -1 : 0) - (oldData.activeDownlineCount || 0), 
                  (oldState === 'dormant' ? -1 : 0) - (oldData.dormantDownlineCount || 0),
                  (oldState === 'suspended' ? -1 : 0) - (oldData.suspendedDownlineCount || 0)
               );
           }
           if (newData.sponsorId && newData.sponsorId !== 'SYSTEM') {
               const newSpRef = db.collection('users').doc(newData.sponsorId);
               await newSpRef.update({
                 directReferralsCount: admin.firestore.FieldValue.increment(1),
                 activeReferralsCount: admin.firestore.FieldValue.increment(nextState === 'active' ? 1 : 0),
                 dormantReferralsCount: admin.firestore.FieldValue.increment(nextState === 'dormant' ? 1 : 0),
                 suspendedReferralsCount: admin.firestore.FieldValue.increment(nextState === 'suspended' ? 1 : 0),
               });
               
               const netRef = db.collection('network').doc(newData.sponsorId);
               await netRef.set({
                  directReferrals: admin.firestore.FieldValue.arrayUnion(context.params.userId)
               }, { merge: true });

               await propagateAncestryUpdatesSafely(
                  newData.sponsorId, 
                  1 + (newData.totalDownlineCount || 0), 
                  (nextState === 'active' ? 1 : 0) + (newData.activeDownlineCount || 0), 
                  (nextState === 'dormant' ? 1 : 0) + (newData.dormantDownlineCount || 0),
                  (nextState === 'suspended' ? 1 : 0) + (newData.suspendedDownlineCount || 0)
               );
           }
       } else if (activityStateChanged && newData.sponsorId && newData.sponsorId !== 'SYSTEM') {
           const spRef = db.collection('users').doc(newData.sponsorId);
           await spRef.update({
             activeReferralsCount: admin.firestore.FieldValue.increment(diffActive),
             dormantReferralsCount: admin.firestore.FieldValue.increment(diffDormant),
             suspendedReferralsCount: admin.firestore.FieldValue.increment(diffSuspended)
           });
           
           await propagateAncestryUpdatesSafely(newData.sponsorId, 0, diffActive, diffDormant, diffSuspended);
       }
       
       if (activityStateChanged && nextState === 'active' && oldState !== 'active') {
         await db.collection('notifications').add({
           userId: context.params.userId,
           title: 'Activity Status Update',
           message: 'Congratulations! You are now an Active Member.',
           isRead: false,
           createdAt: admin.firestore.FieldValue.serverTimestamp()
         });
       }
    }

    // Rank Check when important values structurally change implicitly
    if (!activityStateChanged && (
      newData.directReferralsCount !== oldData.directReferralsCount ||
      newData.totalDownlineCount !== oldData.totalDownlineCount ||
      newData.activeDownlineCount !== oldData.activeDownlineCount ||
      newData.activeReferralsCount !== oldData.activeReferralsCount
    )) {
      await updateRankSafely(context.params.userId, newData);
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
    
    // Only process if status changed to 'deleted'
    if (newData.status !== 'deleted' || oldData.status === 'deleted') {
      return null;
    }
    
    try {
      // Find all users belonging to this team
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
          const updates: any = {
            teamId: 'SYSTEM'
          };
          if (id === oldData.teamLeaderId) {
             updates.roleType = 'team_member'; 
          }
          batch.update(db.collection('users').doc(id), updates);
        }
        await batch.commit();
      }
      
      console.log(`Cleaned up references for ${idsArray.length} users for deleted team ${teamId}.`);
      
      // Finally, hard delete the team document itself to clean up
      await db.collection('teams').doc(teamId).delete();
      console.log(`Successfully hard-deleted team document ${teamId}.`);
    } catch (e) {
      console.error(`Error cleaning up after deleting team ${teamId}`, e);
    }
    return null;
  });

export const onUserDeleted = functions.firestore
  .document('users/{userId}')
  .onDelete(async (snap: any, context: any) => {
     // A hard delete from Super Admin should delete the Firebase Auth user entirely.
    const userId = context.params.userId;
    try {
      await admin.auth().deleteUser(userId);
      console.log(`Successfully deleted auth user ${userId} after hard document deletion.`);
    } catch (e: any) {
      if (e.code !== 'auth/user-not-found') {
        console.error("Error deleting auth user", userId, e);
      }
    }
    
    // Cleanup associated network document
    try {
      await db.collection('network').doc(userId).delete();
      console.log(`Successfully cleaned up network doc for ${userId}`);
    } catch (e: any) {
      console.error("Error deleting network doc", userId, e);
    }
    return null;
  });

// ----------------------------------------------------------------------------
// 7. METRIC RECONCILIATION ENGINE
// ----------------------------------------------------------------------------

export const reconcileHierarchyCounts = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('permission-denied', 'Must be authenticated');
  }
  const adminDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!adminDoc.exists || (adminDoc.data()?.role !== 'admin' && adminDoc.data()?.role !== 'super_admin')) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can run reconciliation.');
  }

  await runReconciliation();
  return { success: true, message: "Reconciliation complete" };
});

export const scheduledReconciliation = functions.pubsub.schedule('every 24 hours').onRun(async (context: any) => {
  await runReconciliation();
  console.log("Nightly metric reconciliation completed.");
  return null;
});

async function runReconciliation() {
  console.log("Starting Enterprise Metric Reconciliation...");
  
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();
  
  const usersMap = new Map();
  for (const doc of snapshot.docs) {
    usersMap.set(doc.id, doc.data());
  }

  const actualCounts = new Map<string, any>();
  
  // 1. Calculate ground truth from actual hierarchy
  for (const doc of snapshot.docs) {
    const userData = doc.data();
    const isSuspended = userData.activityState === 'suspended' || userData.status === 'archived';
    const isDormant = userData.activityState === 'dormant' && !isSuspended;
    const isActive = userData.activityState === 'active' && !isSuspended;
    
    // Direct Referral logic
    if (userData.sponsorId && userData.sponsorId !== 'SYSTEM') {
      if (!actualCounts.has(userData.sponsorId)) {
        initCounts(actualCounts, userData.sponsorId);
      }
      const spCounts = actualCounts.get(userData.sponsorId);
      spCounts.directReferrals++;
      if (isActive) spCounts.activeReferrals++;
      if (isDormant) spCounts.dormantReferrals++;
      if (isSuspended) spCounts.suspendedReferrals++;
      
      // Propagate downline stats up
      let currentId = userData.sponsorId;
      const paths = new Set<string>();
      let maxDepth = 50;
      
      while (currentId && currentId !== 'SYSTEM' && maxDepth > 0) {
        if (paths.has(currentId)) break; // Prevent circular
        paths.add(currentId);
        
        if (!actualCounts.has(currentId)) {
          initCounts(actualCounts, currentId);
        }
        const upCounts = actualCounts.get(currentId);
        
        upCounts.totalDownline++;
        if (isActive) upCounts.activeDownline++;
        if (isDormant) upCounts.dormantDownline++;
        if (isSuspended) upCounts.suspendedDownline++;
        
        // fetch parent via map instead of find
        const parentData = usersMap.get(currentId);
        if (!parentData) break;
        currentId = parentData.sponsorId;
        maxDepth--;
      }
    }
  }

  // 2. Apply corrections if there are discrepancies
  const batchSize = 100;
  // Ensure every user is checked, not just those with downlines
  for (const doc of snapshot.docs) {
    if (!actualCounts.has(doc.id)) {
      initCounts(actualCounts, doc.id);
    }
  }
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
        
        if (uData.directReferralsCount !== counts.directReferrals) {
          needsUpdate = true;
          updateObj.directReferralsCount = counts.directReferrals;
        }
        if (uData.activeReferralsCount !== counts.activeReferrals) {
          needsUpdate = true;
          updateObj.activeReferralsCount = counts.activeReferrals;
        }
        if (uData.dormantReferralsCount !== counts.dormantReferrals) {
          needsUpdate = true;
          updateObj.dormantReferralsCount = counts.dormantReferrals;
        }
        if (uData.suspendedReferralsCount !== counts.suspendedReferrals) {
          needsUpdate = true;
          updateObj.suspendedReferralsCount = counts.suspendedReferrals;
        }
        if (uData.totalDownlineCount !== counts.totalDownline) {
          needsUpdate = true;
          updateObj.totalDownlineCount = counts.totalDownline;
        }
        if (uData.activeDownlineCount !== counts.activeDownline) {
          needsUpdate = true;
          updateObj.activeDownlineCount = counts.activeDownline;
        }
        if (uData.dormantDownlineCount !== counts.dormantDownline) {
          needsUpdate = true;
          updateObj.dormantDownlineCount = counts.dormantDownline;
        }
        if (uData.suspendedDownlineCount !== counts.suspendedDownline) {
          needsUpdate = true;
          updateObj.suspendedDownlineCount = counts.suspendedDownline;
        }
        
        if (needsUpdate) {
          batch.update(uRef, updateObj);
          batch.set(db.collection('network').doc(userId), updateObj, { merge: true });
        }
      }
    }
    await batch.commit();
  }
  
  // 3. Reconcile Teams
  console.log("Reconciling Teams...");
  const teamsRef = db.collection('teams');
  const teamSnap = await teamsRef.get();
  
  const teamBatchSize = 100;
  for (let i = 0; i < teamSnap.docs.length; i += teamBatchSize) {
    const batch = db.batch();
    const chunk = teamSnap.docs.slice(i, i + teamBatchSize);
    
    for (const teamDoc of chunk) {
      const teamId = teamDoc.id;
      const teamUsers = snapshot.docs.filter((d: any) => d.data().teamId === teamId);
      
      let totalMembers = 0;
      let activeMembers = 0;
      let dormantMembers = 0;
      let suspendedMembers = 0;
      
      for (const u of teamUsers) {
        const uState = u.data().activityState;
        const uStatus = u.data().status;
        const isSuspended = uState === 'suspended' || uStatus === 'archived';
        
        totalMembers++;
        if (isSuspended) {
          suspendedMembers++;
        } else if (uState === 'active') {
          activeMembers++;
        } else if (uState === 'dormant') {
          dormantMembers++;
        }
      }
      
      const currentTeamData = teamDoc.data();
      const needsUpdate = 
        currentTeamData.totalMembers !== totalMembers ||
        currentTeamData.activeMembers !== activeMembers ||
        currentTeamData.dormantMembers !== dormantMembers ||
        currentTeamData.suspendedMembers !== suspendedMembers;
        
      if (needsUpdate) {
        batch.update(teamsRef.doc(teamId), {
          totalMembers,
          activeMembers,
          dormantMembers,
          suspendedMembers
        });
      }
    }
    await batch.commit();
  }

  console.log("Enterprise Metric Reconciliation finished.");
}

function initCounts(map: Map<string, any>, userId: string) {
  map.set(userId, {
    directReferrals: 0,
    activeReferrals: 0,
    dormantReferrals: 0,
    suspendedReferrals: 0,
    totalDownline: 0,
    activeDownline: 0,
    dormantDownline: 0,
    suspendedDownline: 0
  });
}


