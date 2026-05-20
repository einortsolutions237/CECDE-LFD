import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

export const updateActivityState = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    
    // Only proceed if directReferralsCount has changed
    if (newData.directReferralsCount === oldData.directReferralsCount) {
      return null;
    }

    const newDirects = newData.directReferralsCount || 0;
    const currentState = newData.activityState || 'dormant';
    let nextState = 'dormant';
    
    if (newDirects >= 3) {
      nextState = 'active';
    }

    if (currentState !== nextState) {
      const updates: any = { activityState: nextState };
      await change.after.ref.update(updates);

      // Increment/Decrement team active members
      if (newData.teamId && newData.teamId !== newData.sponsorId) {
        const d = nextState === 'active' ? 1 : -1;
        const scoreInc = nextState === 'active' ? 3 : -3;
        await db.collection('teams').doc(newData.teamId).update({
           activeMembers: admin.firestore.FieldValue.increment(d),
           activeDownlineCount: admin.firestore.FieldValue.increment(d),
           leaderPerformanceScore: admin.firestore.FieldValue.increment(scoreInc)
        }).catch(err => console.error('Failed to update team active counts', err));
      }
      
      if (nextState === 'active') {
        const userId = context.params.userId;
        await db.collection('notifications').add({
          userId: userId,
          title: 'Activity Status',
          message: 'Congratulations! You are now an Active Member.',
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    return null;
  });

export const handleNewUserRegistration = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const newUser = snap.data();
    const sponsorId = newUser.sponsorId;
    const userId = context.params.userId;

    if (!sponsorId || sponsorId === 'SYSTEM') return null;

    try {
      const uRef = db.collection('users').doc(sponsorId);
      let newTeamLeaderId = sponsorId;

      await db.runTransaction(async (transaction) => {
        const uDoc = await transaction.get(uRef);
        if (uDoc.exists) {
           const uData = uDoc.data();
           const currentDirects = uData?.directReferralsCount || 0;
           const newCount = currentDirects + 1;
           const updates: any = {
             directReferralsCount: admin.firestore.FieldValue.increment(1)
           };
           
           if (newCount >= 1 && uData?.roleType !== 'team_leader') {
             updates.roleType = 'team_leader';
             updates.teamId = sponsorId;
           } else if (uData?.teamId) {
             newTeamLeaderId = uData.teamId;
           }
           transaction.update(uRef, updates);
        }
      });
      
      await snap.ref.update({ teamId: newTeamLeaderId, roleType: 'team_member' });

      // Update sponsor's network stats
      const sponsorNetworkRef = db.collection('network').doc(sponsorId);
      
      await db.runTransaction(async (transaction) => {
        const networkDoc = await transaction.get(sponsorNetworkRef);
        
        if (networkDoc.exists) {
          const data = networkDoc.data();
          const currentDirects = data?.directReferrals || [];
          
          if (!currentDirects.includes(userId)) {
            transaction.update(sponsorNetworkRef, {
              directReferrals: admin.firestore.FieldValue.arrayUnion(userId),
              activeDownlineCount: admin.firestore.FieldValue.increment(1)
            });
          }
        }
      });
      // Ranking calculation is handled in propagateNetworkGrowth
    } catch (e) {
      console.error("Error processing new user registration", e);
    }
    return null;
  });

// Event-driven rank update and ancestor stats update
export const propagateNetworkGrowth = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const newUser = snap.data();
    let currentSponsorId = newUser.sponsorId;
    
    if (!currentSponsorId || currentSponsorId === 'SYSTEM') return null;

    try {
      const batch = db.batch();
      let sponsorIds = [];
      let currentId = currentSponsorId;

      // Collect all ancestors (to avoid infinite loops, cap at 50 levels)
      for (let i = 0; i < 50; i++) {
        if (!currentId || currentId === 'SYSTEM') break;
        const parentDoc = await db.collection('users').doc(currentId).get();
        if (!parentDoc.exists) break;
        
        sponsorIds.push(currentId);
        currentId = parentDoc.data()?.sponsorId;
      }

      // Propagate totalDownlineCount increment
      for (const sId of sponsorIds) {
        const uRef = db.collection('users').doc(sId);
        const netRef = db.collection('network').doc(sId);
        
        batch.update(uRef, {
          totalDownlineCount: admin.firestore.FieldValue.increment(1)
        });
        batch.update(netRef, {
          totalDownlineCount: admin.firestore.FieldValue.increment(1)
        });
      }

      // Increment team metrics if applicable
      const assignedTeamId = newUser.teamId || null;
      if (assignedTeamId) {
        let scoreIncrement = 2; // +1 downline = +2 score
        let isDirectForTeam = false;
        
        // If the new user's sponsor is actually the team leader
        if (assignedTeamId === currentSponsorId) {
           isDirectForTeam = true;
           scoreIncrement = 5;
        }

        const teamRef = db.collection('teams').doc(assignedTeamId);
        
        const teamUpdates: any = {
          totalMembers: admin.firestore.FieldValue.increment(1),
          totalDownlineCount: admin.firestore.FieldValue.increment(1),
          leaderPerformanceScore: admin.firestore.FieldValue.increment(scoreIncrement)
        };
        
        if (isDirectForTeam) {
            teamUpdates.leaderDirectReferralsCount = admin.firestore.FieldValue.increment(1);
        }

        batch.update(teamRef, teamUpdates);
      }
      
      await batch.commit();

      // Check and update ranks for all ancestors
      for (const sId of sponsorIds) {
        const uRef = db.collection('users').doc(sId);
        const uDoc = await uRef.get();
        if (uDoc.exists) {
          const uData = uDoc.data()!;
          const totalDownline = uData.totalDownlineCount || 0;
          const directCount = uData.directReferralsCount || 0;
          const walletBalance = uData.walletBalance || 0;
          
          let newRank = 'Member';
          if (totalDownline >= 1000 && walletBalance >= 5000) newRank = 'Crown Ambassador';
          else if (totalDownline >= 500 && walletBalance >= 1000) newRank = 'Diamond';
          else if (totalDownline >= 100 && walletBalance >= 500) newRank = 'Platinum';
          else if (totalDownline >= 50 && walletBalance >= 200) newRank = 'Gold';
          else if (totalDownline >= 20 && walletBalance >= 100) newRank = 'Silver';
          else if (directCount >= 5 && walletBalance >= 50) newRank = 'Bronze';
          
          if (uData.currentRank !== newRank) {
            await uRef.update({ currentRank: newRank });
            await db.collection('notifications').add({
              userId: sId,
              title: 'Rank Upgraded!',
              message: `Congratulations! Your rank has been upgraded to ${newRank}.`,
              isRead: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
      }
    } catch (e) {
      console.error("Error propagating network growth", e);
    }
    return null;
  });

export const checkRankOnWalletUpdate = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    
    // Only proceed if walletBalance has changed
    if (newData.walletBalance === oldData.walletBalance) {
      return null;
    }

    try {
      const uRef = change.after.ref;
      const totalDownline = newData.totalDownlineCount || 0;
      const directCount = newData.directReferralsCount || 0;
      const walletBalance = newData.walletBalance || 0;
      
      let newRank = 'Member';
      if (totalDownline >= 1000 && walletBalance >= 5000) newRank = 'Crown Ambassador';
      else if (totalDownline >= 500 && walletBalance >= 1000) newRank = 'Diamond';
      else if (totalDownline >= 100 && walletBalance >= 500) newRank = 'Platinum';
      else if (totalDownline >= 50 && walletBalance >= 200) newRank = 'Gold';
      else if (totalDownline >= 20 && walletBalance >= 100) newRank = 'Silver';
      else if (directCount >= 5 && walletBalance >= 50) newRank = 'Bronze';
      
      if (newData.currentRank !== newRank) {
        await uRef.update({ currentRank: newRank });
        const rankOrder = ['Member', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Crown Ambassador'];
        const isUpgrade = rankOrder.indexOf(newRank) > rankOrder.indexOf(newData.currentRank || 'Member');
        
        await db.collection('notifications').add({
          userId: context.params.userId,
          title: isUpgrade ? 'Rank Upgrade!' : 'Rank Adjustment',
          message: isUpgrade 
            ? `Congratulations! Your rank has been upgraded to ${newRank}.`
            : `Your rank has been adjusted to ${newRank}.`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (e) {
      console.error("Error evaluating rank on wallet update", e);
    }
    return null;
  });

