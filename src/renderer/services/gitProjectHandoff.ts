export const GIT_REPO_PATH_KEY = 'dex-git-repo-path';
export const OPEN_GIT_REPOSITORY_EVENT = 'dex-git-open-repository';

export function openGitClient(root: string) {
  // An already-mounted app receives the event. A new app reads its saved path.
  try { localStorage.setItem(GIT_REPO_PATH_KEY, root); } catch { /* Storage can be unavailable. */ }
  window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: 'git' } }));
  window.dispatchEvent(new CustomEvent(OPEN_GIT_REPOSITORY_EVENT, { detail: root }));
}
