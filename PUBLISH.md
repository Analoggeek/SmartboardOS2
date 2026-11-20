# SmartBoardOS ko GitHub se live karna (Hinglish)

Repo ka naam: **smartboardOS**
Live URL banega: `https://<your-username>.github.io/smartboardOS/`

---

## Method 1 — GitHub CLI (sabse fast, 1 command)

```bash
cd smartboardOS
gh auth login                 # agar pehle se login nahi hai
gh repo create smartboardOS --public --source=. --remote=origin --push
```

Phir: repo → **Settings → Pages → Source = GitHub Actions**. Done ✅

---

## Method 2 — normal git (username/password ki jagah token use karein)

1. GitHub par naya **empty** repo banaiye: naam `smartboardOS`, Public, *README/gitignore add nahi karna*.
2. Apne folder me:

```bash
cd smartboardOS
git init -b main
git add .
git commit -m "feat: SmartBoardOS v1.2.0 — teacher's hub (pen/palm, safe browser, pages, stickers)"
git remote add origin https://github.com/<your-username>/smartboardOS.git
git push -u origin main
```

Password ki jagah **Personal Access Token** daalein:
GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → scope: `repo` (aur `workflow`).

3. Repo → **Settings → Pages** → *Build and deployment* → **Source: GitHub Actions**.
4. Actions tab me "Deploy SmartBoardOS to GitHub Pages" workflow chalega (~40 sec), phir URL live.

---

## Method 3 — browser se, bina terminal

1. GitHub par repo banaiye → **Add file → Upload files**.
2. `smartboardOS-v1.3.0.zip` ko apne laptop par extract karein (files seedha andar hain), phir **saari files/folders** drag & drop karke commit karein
   (zip ko seedha upload na karein — Pages zip ko serve nahi karta).
3. **Settings → Pages → Source: GitHub Actions** select karein (workflow file already included hai).
4. 1 minute me site live.

> Pages ko branch se bhi serve kar sakte hain: *Source: Deploy from a branch → main → /(root)*. Is case me `.nojekyll` file already included hai, isliye `js/`, `assets/` folders waise hi serve honge.

---

## Update kaise karein

```bash
# changes ke baad
# changes ke baad sw.js me VERSION bump karein (current: sbos-v1.2.0)
git add .
git commit -m "update: ..."
git push
```

Workflow dobara deploy kar dega. Browser me app kholne par naya version aa jayega
(service worker cache update hota hai).

---

## Install as app (PWA)

Live site khulne ke baad:

- **Android/Chrome:** ⋮ menu → *Install app* (ya top-bar ke install icon se)
- **Desktop Chrome/Edge:** address bar ke right side install icon
- **iPhone/iPad Safari:** Share → *Add to Home Screen*

Install karne ke baad internet ke bina bhi chalega — board, PDF Studio, sab offline.

---

## Local test

```bash
cd smartboardOS
python3 -m http.server 5173
# ya: npx serve .
```

phir <http://localhost:5173> khol lein.
