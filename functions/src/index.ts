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
      await change.after.ref.update({ activityState: nextState });
      
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

export const updateDirectReferrals = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const newUser = snap.data();
    const sponsorId = newUser.sponsorId;
    const userId = context.params.userId;

    if (!sponsorId || sponsorId === 'SYSTEM') return null;

    try {
      // Logic handled securely on server side
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
      
      // Assign the new user to the sponsor's team immediately
      await snap.ref.update({ teamId: newTeamLeaderId, roleType: 'team_member' });

    } catch (e) {
      console.error("Error updating direct referrals", e);
    }
    return null;
  });

// Triggered when a new user is created
export const onUserCreated = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const newUser = snap.data();
    const sponsorId = newUser.sponsorId;
    const userId = context.params.userId;

    if (!sponsorId || sponsorId === 'SYSTEM') return;

    try {
      // Find the sponsor document by referralCode
      const sponsorSnapshot = await db.collection('users').where('referralCode', '==', sponsorId).get();
      
      if (sponsorSnapshot.empty) return;
      
      const sponsorDoc = sponsorSnapshot.docs[0];
      const sponsorUid = sponsorDoc.id;

      // Update sponsor's network stats
      const sponsorNetworkRef = db.collection('network').doc(sponsorUid);
      
      await db.runTransaction(async (transaction) => {
        const networkDoc = await transaction.get(sponsorNetworkRef);
        
        if (networkDoc.exists) {
          const data = networkDoc.data();
          const currentDirects = data?.directReferrals || [];
          
          if (!currentDirects.includes(userId)) {
            transaction.update(sponsorNetworkRef, {
              directReferrals: admin.firestore.FieldValue.arrayUnion(userId),
              totalDownlineCount: admin.firestore.FieldValue.increment(1),
              activeDownlineCount: admin.firestore.FieldValue.increment(1) // Assuming actively registered
            });
          }
        }
      });

      // Recalculate Rank for Sponsor
      const updatedNetworkSnap = await sponsorNetworkRef.get();
      const updatedNetwork = updatedNetworkSnap.data();
      const directCount = updatedNetwork?.directReferrals?.length || 0;
      const totalDownline = updatedNetwork?.totalDownlineCount || 0;
      
      let newRank = 'Bronze';
      if (totalDownline >= 500) newRank = 'Diamond';
      else if (totalDownline >= 100) newRank = 'Platinum';
      else if (totalDownline >= 50) newRank = 'Gold';
      else if (totalDownline >= 20) newRank = 'Silver';
      else if (directCount >= 5) newRank = 'Bronze';
      else newRank = 'Member';

      if (sponsorDoc.data().currentRank !== newRank) {
        await sponsorDoc.ref.update({ currentRank: newRank });
        
        // Create a notification
        await db.collection('notifications').add({
          userId: sponsorUid,
          title: 'Rank Upgrade!',
          message: `Congratulations! You have been upgraded to ${newRank}.`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

    } catch (error) {
      console.error("Error processing new user in network", error);
    }
  });

// Background job to periodically check and update ranks for all users
// Runs every 24 hours
export const updateAllUserRanks = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    try {
      const usersSnapshot = await db.collection('users').get();
      
      // Firestore transactions/batch have a limit of 500 operations.
      // We process updates in chunks of 500.
      let batch = db.batch();
      let operationCount = 0;

      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const userId = userDoc.id;
        
        // Fetch user's network stats
        const networkDoc = await db.collection('network').doc(userId).get();
        const networkData = networkDoc.exists ? networkDoc.data() : null;
        
        const directCount = networkData?.directReferrals?.length || 0;
        const totalDownline = networkData?.totalDownlineCount || 0;
        const walletBalance = userData?.walletBalance || 0;
        
        // Define Rank Levels Based on Business Logic (includes walletBalance and team size constraints)
        let newRank = 'Member';
        
        if (totalDownline >= 1000 && walletBalance >= 5000) {
          newRank = 'Crown Ambassador';
        } else if (totalDownline >= 500 && walletBalance >= 1000) {
          newRank = 'Diamond';
        } else if (totalDownline >= 100 && walletBalance >= 500) {
          newRank = 'Platinum';
        } else if (totalDownline >= 50 && walletBalance >= 200) {
          newRank = 'Gold';
        } else if (totalDownline >= 20 && walletBalance >= 100) {
          newRank = 'Silver';
        } else if (directCount >= 5 && walletBalance >= 50) {
          newRank = 'Bronze';
        }
        
        const currentRank = userData?.currentRank || 'Member';

        // Check if rank has changed
        if (currentRank !== newRank) {
          batch.update(userDoc.ref, { currentRank: newRank });
          operationCount++;

          // Determine if it's an upgrade or downgrade for the notification message
          const rankOrder = ['Member', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Crown Ambassador'];
          const isUpgrade = rankOrder.indexOf(newRank) > rankOrder.indexOf(currentRank);
          
          if (isUpgrade) {
            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
              userId: userId,
              title: 'Rank Upgrade!',
              message: `Congratulations! Your rank has been upgraded to ${newRank} due to network and wallet performance.`,
              isRead: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            operationCount++;
          } else {
            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
              userId: userId,
              title: 'Rank Adjustment',
              message: `Your rank has been adjusted to ${newRank} based on the current network performance criteria.`,
              isRead: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            operationCount++;
          }
          
          // Commit batch if it's close to the 500 limit
          if (operationCount >= 490) {
            await batch.commit();
            batch = db.batch(); // Create a new batch
            operationCount = 0;
          }
        }
      }

      // Commit any remaining operations in the last batch
      if (operationCount > 0) {
        await batch.commit();
      }
      
      console.log('Successfully completed scheduled rank updates.');
    } catch (error) {
      console.error('Error during scheduled background rank update job', error);
    }
  });

export const updateMetricsSync = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    try {
      const usersSnap = await db.collection('users').get();
      const teamsSnap = await db.collection('teams').get();

      const users: any[] = [];
      usersSnap.forEach(u => users.push({ id: u.id, ...u.data() }));

      const teams: any[] = [];
      teamsSnap.forEach(t => teams.push({ id: t.id, ...t.data() }));

      let batch = db.batch();
      let operationCount = 0;

      const commitBatchIfNeeded = async () => {
        if (operationCount >= 490) {
          await batch.commit();
          batch = db.batch();
          operationCount = 0;
        }
      };

      const adjList = new Map<string, string[]>();
      users.forEach(u => adjList.set(u.id, []));
      users.forEach(u => {
        if (u.sponsorId && adjList.has(u.sponsorId)) {
           adjList.get(u.sponsorId)!.push(u.id);
        }
      });

      for (const user of users) {
        const directs = adjList.get(user.id) || [];
        const directCount = directs.length;
        
        let downlineCount = 0;
        const stack = [...directs];
        while (stack.length > 0) {
          const current = stack.pop()!;
          downlineCount++;
          const children = adjList.get(current) || [];
          stack.push(...children);
        }

        if (user.directReferralsCount !== directCount || user.totalDownlineCount !== downlineCount) {
          const userRef = db.collection('users').doc(user.id);
          batch.update(userRef, { 
            directReferralsCount: directCount,
            totalDownlineCount: downlineCount
          });
          user.directReferralsCount = directCount;
          user.totalDownlineCount = downlineCount;
          operationCount++;
          await commitBatchIfNeeded();
        }
      }

      for (const team of teams) {
        const leaderId = team.teamLeaderId;
        let leaderDownlineCount = 0;
        let leaderActiveDownlineCount = 0;
        let leaderPerformanceScore = 0;

        const leads = adjList.get(leaderId) || [];
        const stack = [...leads];
        const networkMembersId = new Set<string>();
        while (stack.length > 0) {
           const current = stack.pop()!;
           if (!networkMembersId.has(current)) {
               networkMembersId.add(current);
               const children = adjList.get(current) || [];
               stack.push(...children);
           }
        }

        leaderDownlineCount = networkMembersId.size;

        networkMembersId.forEach(uid => {
           const u = users.find(user => user.id === uid);
           if (u) {
             if (u.accountStatus === 'active') {
                leaderActiveDownlineCount++;
             }
             const direct = u.directReferralsCount || 0;
             const downline = u.totalDownlineCount || 0;
             const active = u.activityState === 'active' ? 1 : 0;
             leaderPerformanceScore += (direct * 5) + ((downline - direct) * 2) + (active * 3);
           }
        });

        if (
          team.totalDownlineCount !== leaderDownlineCount ||
          team.activeDownlineCount !== leaderActiveDownlineCount ||
          team.leaderPerformanceScore !== leaderPerformanceScore ||
          team.leaderDirectReferralsCount !== leads.length
        ) {
          const teamRef = db.collection('teams').doc(team.id);
          batch.update(teamRef, {
            totalDownlineCount: leaderDownlineCount,
            activeDownlineCount: leaderActiveDownlineCount,
            leaderPerformanceScore,
            leaderDirectReferralsCount: leads.length
          });
          operationCount++;
          await commitBatchIfNeeded();
        }
      }

      if (operationCount > 0) {
        await batch.commit();
      }
      console.log('Successfully completed scheduled metrics sync.');
    } catch (err) {
      console.error('Error during scheduled background metrics sync', err);
    }
  });
