import React, { useEffect } from 'react';
import { collection, query, onSnapshot, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

export default function BackgroundMetricsSync() {
  const { userData } = useAuth();
  const isSuperAdmin = userData?.role === 'super_admin';

  useEffect(() => {
    // Only run this background job for the super admin to avoid multiple clients writing simultaneously
    if (!isSuperAdmin) return;

    let debounceTimer: NodeJS.Timeout;

    // Listen to all users
    const usersQuery = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      // Debounce the recalculation so it doesn't fire wildly on bulk updates
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const users: any[] = [];
          snapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
          });

          // Fetch all teams
          const teamsSnap = await getDocs(collection(db, 'teams'));
          const teams: any[] = [];
          teamsSnap.forEach(tDoc => {
            teams.push({ id: tDoc.id, ...tDoc.data() });
          });

          const batch = writeBatch(db);
          let updatesCount = 0;

          // Build adj list for downlines
          const adjList = new Map<string, string[]>();
          users.forEach(u => {
            adjList.set(u.id, []);
          });
          users.forEach(u => {
            if (u.sponsorId && adjList.has(u.sponsorId)) {
               adjList.get(u.sponsorId)!.push(u.id);
            }
          });

          // Recalculate user metrics
          users.forEach(user => {
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
              const userRef = doc(db, 'users', user.id);
              batch.update(userRef, { 
                directReferralsCount: directCount,
                totalDownlineCount: downlineCount
              });
              // update the object in memory as well so teams calculation below uses correct values
              user.directReferralsCount = directCount;
              user.totalDownlineCount = downlineCount;
              updatesCount++;
            }
          });

          // For each team, aggregate metrics and compare
          teams.forEach(team => {
            // Team leader network
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

            // If metrics differ from current team doc, add to batch
            if (
              team.totalDownlineCount !== leaderDownlineCount ||
              team.activeDownlineCount !== leaderActiveDownlineCount ||
              team.leaderPerformanceScore !== leaderPerformanceScore
            ) {
              const teamRef = doc(db, 'teams', team.id);
              batch.update(teamRef, {
                totalDownlineCount: leaderDownlineCount,
                activeDownlineCount: leaderActiveDownlineCount,
                leaderPerformanceScore
              });
              updatesCount++;
            }
          });

          if (updatesCount > 0) {
            await batch.commit();
            console.log(`Background Sync: Updated ${updatesCount} teams with new metrics.`);
          }
        } catch (err) {
          console.error("Background metrics sync failed:", err);
        }
      }, 5000); // 5 second debounce
    });

    return () => {
      unsubscribe();
      clearTimeout(debounceTimer);
    };
  }, [isSuperAdmin]);

  return null;
}
