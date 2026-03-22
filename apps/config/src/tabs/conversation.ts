/** Conversation tab — placeholder */
export function render(container: HTMLElement): void {
  container.innerHTML = '';
  const h = document.createElement('h2');
  h.textContent = 'Conversation tab';
  h.style.cssText = 'font-size:20px;font-weight:600;color:#e0e0e0;';
  container.appendChild(h);
}
