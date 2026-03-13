# TaskFlow — Team Task Manager

A drag-and-drop task board for managing your team's work. Think of it as your own private Trello.

**What it does:**
- A board with columns: To Do → In Progress → Review → Done
- Drag tasks between columns to update their status
- Add your team members, assign tasks, set due dates
- Group tasks by project
- Track progress with percentage bars
- Filter by person, project, or priority
- Dark mode
- Export your data as a backup file, import it back anytime

---

## How to get this running (step by step)

We'll do three things:
1. **Create a database** on Supabase (where your data lives)
2. **Set up the code** on GitHub (where your app lives)
3. **Deploy it** on Vercel (so you can open it in a browser)

Don't worry — each step is small and I'll walk you through it.

---

## Step 1: Get your database ready on Supabase

You already have a Supabase account, so this should be quick.

1. Go to [supabase.com](https://supabase.com) and open your dashboard
2. Click **New Project**
   - Give it a name like `taskflow`
   - Set a database password — **copy this password somewhere safe**, you'll need it in a minute
   - Pick a region close to you
   - Click **Create new project** and wait about a minute for it to spin up
3. Once it's ready, go to **Settings** (the gear icon on the left sidebar)
4. Click **Database** in the settings menu
5. Scroll down to **Connection string** and click the **URI** tab
6. You'll see something like:
   ```
   postgresql://postgres.[something]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
7. **Copy this whole thing.** Replace `[YOUR-PASSWORD]` with the password you set in step 2.

That's your database connection string. Keep it handy.

---

## Step 2: Put the code on GitHub

1. Go to [github.com](https://github.com) and click the **+** button → **New repository**
2. Name it `taskflow` (or whatever you like)
3. Keep it **Public** or **Private** — your choice
4. **Don't** check "Add a README" (we already have one)
5. Click **Create repository**
6. You'll see an empty repo page. Now click the green **Code** button, then **Codespaces** tab, then **Create codespace on main**

This opens your Codespace — it's like a little computer in your browser with a code editor and a terminal at the bottom.

### Upload the project files

7. In your Codespace, you should see a file explorer on the left. **Drag the contents of the downloaded zip folder** into the file explorer area. (Unzip the folder first on your computer, then drag everything inside `taskflow-vercel/` into the Codespace.)

   Or if you prefer the terminal, you can upload the zip and unzip it there.

### Set up your secret database connection

8. In the Codespace terminal (the dark panel at the bottom), type:
   ```
   cp .env.example .env
   ```
   This creates your private settings file.

9. Open the `.env` file in the editor (click it in the file explorer) and replace the example text with your actual Supabase connection string from Step 1. It should look something like:
   ```
   DATABASE_URL=postgresql://postgres.abcdefghijk:MySecretPassword123@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
   Save the file.

### Install everything and create the database tables

10. In the terminal, type:
    ```
    npm install
    ```
    Wait for it to finish (takes about 30 seconds).

11. Then type:
    ```
    npm run db:push
    ```
    This tells Supabase "hey, here are the tables I need" and creates them for you. You should see some green output saying it's done.

### Make sure it works

12. Type:
    ```
    npm run dev
    ```
    You should see a message saying the server is running. Your Codespace will show a little popup — click **Open in Browser**. You should see the TaskFlow board with sample data.

13. If it looks good, press `Ctrl+C` in the terminal to stop the server. Time to put it online for real.

### Save your code to GitHub

14. In the terminal, type these lines one at a time:
    ```
    git add .
    git commit -m "TaskFlow initial setup"
    git push
    ```

Your code is now on GitHub.

---

## Step 3: Deploy on Vercel

Almost done — this is the last part.

1. Go to [vercel.com](https://vercel.com) and log in with your GitHub account
2. Click **Add New...** → **Project**
3. You should see your `taskflow` repo in the list. Click **Import**
4. Before clicking Deploy, expand **Environment Variables** and add one:
   - **Name:** `DATABASE_URL`
   - **Value:** paste your Supabase connection string (the same one from your `.env` file)
   - Click **Add**
5. Click **Deploy**
6. Wait about a minute. When it's done, Vercel gives you a URL like `taskflow-abc123.vercel.app`
7. Open that URL — your TaskFlow is live on the internet.

---

## You're done!

Your task board is now:
- **Saved on GitHub** — your code is safe and version-controlled
- **Running on Vercel** — anyone with the URL can use it
- **Storing data in Supabase** — everything persists, nothing disappears

### Day-to-day use

- Just open your Vercel URL to use the app
- Add team members on the Team page
- Create projects on the Projects page
- Create and drag tasks on the Board
- Use Settings to export a backup anytime

### If you want to make changes later

1. Open your repo on GitHub
2. Launch a Codespace
3. Make your changes
4. `git add .` → `git commit -m "description of change"` → `git push`
5. Vercel automatically picks up the change and re-deploys. Done.

---

## What's inside (if you're curious)

| Folder | What it does |
|--------|-------------|
| `client/` | The visual part — what you see in the browser |
| `server/` | The behind-the-scenes part — handles saving and loading data |
| `shared/` | The database structure — what columns and tables exist |

You don't need to understand the code to use it. But if you ever want to tweak something — change a color, add a column, rename things — the code is readable and well-organized.

---

## Troubleshooting

**"DATABASE_URL is not set"**
→ Make sure your `.env` file exists and has your Supabase connection string. On Vercel, make sure you added it as an environment variable.

**"db:push" gives an error**
→ Double-check that your password in the connection string is correct. Make sure there are no extra spaces.

**The board shows but no data appears**
→ The app seeds sample data on first load. Try refreshing. If still empty, check the browser console (right-click → Inspect → Console tab) for any red error messages.

**Changes I push to GitHub don't show up on Vercel**
→ Go to your Vercel dashboard and check if the deployment succeeded. Sometimes there's a build error — Vercel will show you what went wrong.
