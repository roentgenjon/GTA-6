// Anmeldeseite (Name + Passwort). Ohne Anmeldung startet das Spiel nicht.
import { Accounts } from './accounts.js';

export function showLogin(onDone) {
  const old = document.getElementById('login'); if (old) old.remove();
  const root = document.createElement('div'); root.id = 'login';
  let last = ''; try { last = localStorage.getItem('vc_lastname') || ''; } catch (e) { }
  root.innerHTML = `<div class="card">
    <h1>VICE<br>CITY</h1><div class="sub">Anmelden</div>
    <form autocomplete="on">
      <label>Name<input id="lg-name" type="text" name="username" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="16" value="${last.replace(/[^\w\-äöüÄÖÜß]/g, '')}"></label>
      <label>Passwort<input id="lg-pass" type="password" name="password" autocomplete="current-password" maxlength="64"></label>
      <label class="chk"><input type="checkbox" id="lg-rem" checked> Angemeldet bleiben (auf diesem Gerät)</label>
      <div class="msg" id="lg-msg" role="alert"></div>
      <div class="btns"><button class="btn" type="submit" id="lg-login">Anmelden</button><button class="btn alt" type="button" id="lg-reg">Konto erstellen</button></div>
    </form>
    <p class="hint">Mit einem Konto spielst du online mit anderen Spielern. Das Passwort bleibt auf deinem Gerät (nur ein Prüfwert wird gespeichert). Nutze kein Passwort, das du anderswo verwendest – ohne eigenen Server ist die Kontoverwaltung nur ein einfacher Schutz.</p>
  </div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s), nameI = $('#lg-name'), passI = $('#lg-pass'), msg = $('#lg-msg'), bL = $('#lg-login'), bR = $('#lg-reg');
  let busy = false;
  const run = async (mode) => {
    if (busy) return; busy = true; bL.disabled = bR.disabled = true; msg.className = 'msg'; msg.textContent = mode === 'reg' ? 'Konto wird erstellt … (Name wird online geprüft)' : 'Anmeldung läuft …';
    let res; try { res = mode === 'reg' ? await Accounts.register(nameI.value, passI.value, $('#lg-rem').checked) : await Accounts.login(nameI.value, passI.value, $('#lg-rem').checked); } catch (e) { res = { ok: false, msg: 'Fehler: ' + e.message }; }
    busy = false; bL.disabled = bR.disabled = false;
    if (!res.ok) { msg.className = 'msg err'; msg.textContent = res.msg; passI.value = ''; passI.focus(); return; }
    try { localStorage.setItem('vc_lastname', res.name); } catch (e) { }
    if (res.note) { msg.className = 'msg'; msg.textContent = res.note; await new Promise((r) => setTimeout(r, 3500)); }
    root.remove(); onDone(res);
  };
  $('form').addEventListener('submit', (e) => { e.preventDefault(); run('login'); });
  bR.addEventListener('click', () => run('reg'));
  setTimeout(() => (nameI.value ? passI : nameI).focus(), 100);
}
