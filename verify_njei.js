require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin
try {
  const serviceAccount = require('./firebase-service-account.json');
  initializeApp({
    credential: cert(serviceAccount)
  });
} catch(e) {
  console.log("No service account json found or invalid");
  process.exit(1);
}

const db = getFirestore();

async function main() {
  const teams = await db.collection('teams').get();
  
  for (const t of teams.docs) {
    const data = t.data();
    if (data.name && data.name.toLowerCase().includes('njei')) {
       console.log("Team Details:");
       console.log(data);
       
       const leader = await db.collection('users').doc(data.teamLeaderId).get();
       console.log("Leader Details:");
       console.log(leader.exists ? leader.data() : "NOT FOUND");
       
       const membersSnap = await db.collection('users').where('teamId', '==', t.id).get();
       console.log("Team members using teamId:", membersSnap.size, "excluding leader:", membersSnap.docs.filter(d=>d.id !== data.teamLeaderId).length);
       
       const directSnap = await db.collection('users').where('sponsorId', '==', data.teamLeaderId).get();
       console.log("Direct referrals using sponsorId:", directSnap.size, "excluding leader:", directSnap.docs.filter(d=>d.id !== data.teamLeaderId).length);
       
       // get all indirects
       let allInTeam = new Set();
       membersSnap.docs.forEach(d => allInTeam.add(d.id));
       directSnap.docs.forEach(d => allInTeam.add(d.id));
       console.log("Unique members (direct or with teamId):", allInTeam.size);
       
    }
  }
}

main().catch(console.error);
