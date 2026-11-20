# GitHub pe upload — 3 tareeke (v1.3.0)

Repo ka naam **`smartboardOS`** hi rakhein, warna Pages URL badal jayega.

| Tareeka | Kab best hai | Time |
| --- | --- | --- |
| **A. GitHub CLI (`gh`)** | `gh` installed ho | ~1 min |
| **B. git + Personal Access Token** | git installed ho | ~2 min |
| **C. Website upload (bina git)** | laptop pe git nahi hai | ~3 min |

Har case me end me: **Settings → Pages → Source = GitHub Actions** aur live URL
`https://<username>.github.io/smartboardOS/`.

---

## A) GitHub CLI se (sabse aasan)

```bash
cd ~/smartboardOS
gh auth login                      # browser me login
gh repo create smartboardOS --public --source=. --remote=origin --push
```

Bas. Repo ban jayega aur code chala jayega.

---

## B) git + token se

1. GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token**
   Scopes tick karein: **`repo`** aur **`workflow`** (workflow zaroori hai, kyunki repo me Pages ka
   `.github/workflows/deploy.yml` hai). Token copy kar lein — ek hi baar dikhta hai.

2. Terminal me:

```bash
cd ~/smartboardOS
export GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx          # apna token
./scripts/publish.sh <apna-username>
```

Script khud remote set karega, push karega aur URLs print karega.
Manually karna ho to:

```bash
git remote add origin https://github.com/<username>/smartboardOS.git
git push -u origin main
```

Push karte waqt password ki jagah **token** paste karein (GitHub ab password accept nahi karta).

---

## C) Website se upload (git ke bina)

1. GitHub → **New repository** → naam `smartboardOS` → **Public** → *don't* add README → **Create**.
2. **uploading an existing file** link par click karein.
3. **`smartboardOS-v1.3.0.zip`** download karein → extract karein (files seedha andar hain, koi extra folder
   nahi) → sabhi files/folders select karein (`index.html`, `css/`, `js/`, `assets/`, `vendor/`, `docs/`,
   `manifest.webmanifest`, `sw.js`, `README.md`, `LICENSE`, `package.json`) → drag-and-drop → **Commit changes**.
   > Note: browser upload me `.github/` (hidden folder) nahi jata — koi dikkat nahi, neeche wala step use karein.
4. **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
5. 1–2 minute me live: `https://<username>.github.io/smartboardOS/`

---

---

## Kaunsi zip upload karun?

Sirf **ek** zip hai: **`smartboardOS-v1.3.0.zip`** — files zip ke root me hain (extract karke seedha drag-drop).

- GitHub **website** se upload → yehi zip extract karke drag-drop karein
- Git/`gh` se push → **koi zip nahi**, seedha `git push` (repo ek hi clean commit par hai)

---

## Deploy hone ke baad check-list

- [ ] Site khulti hai: `https://<username>.github.io/smartboardOS/`
- [ ] Board pe likhne par **pressure** kaam kar raha hai (agar tablet/stylus hai)
- [ ] **Class Browser** khulta hai aur koi adult query block hoti hai
- [ ] Browser se **Send to board** → card board pe aata hai
- [ ] Phone pe "Add to Home screen" (PWA) chalta hai
- [ ] Hard refresh (`Ctrl/⌘ + Shift + R`) ke baad bhi naya version (`v1.3.0`) dikhta hai

> Update bhejne se pehle `sw.js` aur `js/main.js` me `VERSION` bump karein
> (current: `sbos-v1.3.0` / `1.3.0`), warna purana cache serve hota rahega.
