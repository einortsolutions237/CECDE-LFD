import { collection, query, where, getDocs } from 'firebase/firestore';

export async function deriveTeamLeaderId(userData: any, db: any): Promise<string | null> {
    if (!userData) return null;
    if (userData.roleType === 'team_leader') return userData.uid;
    if (!userData.uplineIds || userData.uplineIds.length === 0) return null;
    
    // We check the nearest 10 upline IDs against the teams collection to find the team leader.
    // uplineIds is ordered [sponsor, grand-sponsor, ...]
    const chunks = [];
    for (let i = 0; i < userData.uplineIds.length; i += 10) {
         chunks.push(userData.uplineIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
        if(chunk.length === 0) continue;
        const q = query(collection(db, 'teams'), where('teamLeaderId', 'in', chunk));
        const docs = await getDocs(q);
        if (!docs.empty) {
            for(const uId of chunk) {
                const match = docs.docs.find((d: any) => d.data().teamLeaderId === uId);
                if (match) return match.data().teamLeaderId;
            }
        }
    }
    
    return null;
}
