/**
 * Firestore events 컬렉션 전체 삭제 스크립트.
 *
 * 사용법:
 *   1. Firebase Console → Settings → Service accounts → Generate new private key
 *   2. 다운받은 JSON을 scripts/service-account.json 으로 저장
 *   3. npx tsx scripts/reset-events.ts
 */
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = path.join(__dirname, 'service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ scripts/service-account.json 파일이 없습니다.');
  console.error('   Firebase Console → Service accounts에서 키를 다운받으세요.');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function deleteCollection(path: string, batchSize = 100): Promise<number> {
  const ref = db.collection(path);
  let deleted = 0;
  while (true) {
    const snapshot = await ref.limit(batchSize).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snapshot.size;
    console.log(`  삭제됨: ${deleted}개`);
  }
  return deleted;
}

async function main() {
  console.log('🗑  events 컬렉션 삭제 중...');
  const eventsDeleted = await deleteCollection('events');
  console.log(`✅ events 삭제 완료: ${eventsDeleted}개`);

  console.log('\n완료. 이제 Phase 1 학교 구분 시스템으로 새로 시작할 수 있습니다.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ 오류:', err);
  process.exit(1);
});
