/**
 * Firestore는 연결이 없으면 저장을 끝내지 않고 기다린다. 화면은 "저장 중"에 멈추고 앱을 끄면 그 저장은 사라진다.
 * 연결이 없음을 아는 때는 바로 실패시켜, 저장되지 않았음을 알 수 있게 한다.
 */
export function assertOnline(): void {
  if (navigator.onLine === false) throw new Error('인터넷에 연결되어 있지 않아 저장하지 못했습니다');
}
