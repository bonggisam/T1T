/**
 * ipcRenderer.invoke는 메인에서 던진 글 앞에 "Error invoking remote method ..."를 붙인다.
 * 선생님께는 우리가 쓴 글만 보여 준다.
 */
export function ipcErrorMessage(err: unknown, fallback: string): string {
  const raw = (err as { message?: unknown })?.message;
  if (typeof raw !== 'string') return fallback;
  return raw.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^(?:[A-Za-z]*Error:\s*)+/, '') || fallback;
}
