import './style.css';
import { EggGame } from './game/Game.js';

const canvas = document.querySelector('#game-canvas');

try {
  const game = new EggGame(canvas);
  if (import.meta.env.DEV) window.__eggGame = game;
  const params = new URLSearchParams(window.location.search);
  if (params.has('difficulty')) game.selectDifficulty(params.get('difficulty'), false);
  if (params.has('play')) game.startGame();
} catch (error) {
  console.error(error);
  document.querySelector('#app').innerHTML = `
    <section class="fatal-error" role="alert" aria-labelledby="fatal-error-title">
      <div class="fatal-error-card">
        <span class="fatal-error-egg" aria-hidden="true"><i></i></span>
        <h1 id="fatal-error-title">주방을 열지 못했어요</h1>
        <p>게임 화면을 준비하지 못했어요.<br>브라우저를 업데이트한 뒤 다시 시도해 주세요.</p>
        <button id="reload-button" type="button">다시 열기</button>
      </div>
    </section>`;
  document.querySelector('#reload-button')?.addEventListener('click', () => window.location.reload());
}
