# 01 — What is the Textile Platform?

- **Working title:** What is the Textile Platform?
- **YouTube title:** What is the Textile Platform? Weave and bead patterns in your browser (DB-WEAVE & JBead)
- **YouTube description:** The Textile Platform brings the free design tools DB-WEAVE (weaving on dobby/shaft looms) and JBead (bead crochet ropes) to your browser — nothing to install, on any device including tablets. In this video we look at the public example patterns, register a free account step by step, and set up language, appearance and timezone. Part 1 of the Textile Platform tutorial series at textile-platform.ch.
- **Target length:** about 7:30
- **Audience:** everyone — newcomers to weaving or bead crochet, and users of the DB-WEAVE or JBead desktop programs
- **Learning goals:**
  - Know what DB-WEAVE and JBead are and what the Textile Platform adds (browser, any device, groups, sharing, chat).
  - Browse the public example patterns without an account.
  - Register, verify the e-mail address and log in with e-mail and password.
  - Know the welcome message, the two starter patterns and the Help link.
  - Set appearance, language and timezone in the profile.

## Demo setup

- Clean local video instance as described in the [README](../README.md) (database `textile_video`, `SHOW_VERIFICATION_CODE=1`, production `STARTER_*` values, local SMTP sink with a web inbox).
- Recording browser profile with the **browser language set to English** (the logged-out home page and the language of the new account, and therefore the English starter patterns, follow the browser language). Logged out, no cookies from earlier test runs.
- No account `carla-sample` and no account with `carla.sample@example.com` exists yet (delete leftovers from rehearsals with `flask --app textileplatform delete-user carla-sample`).
- Second browser tab: the web inbox of the local SMTP sink, empty.
- A prepared password for Carla (at least 8 characters, not trivial); it is only typed into masked fields.
- For scene 2: short screen recordings or screenshots of the DB-WEAVE and JBead desktop programs (e.g. from brunoldsoftware.ch).
- Note: with `SHOW_VERIFICATION_CODE=1` the *Verification pending* page shows a "Local-testing helper" box. Keep it out of the frame or blur it in editing; the scene uses the e-mail link.
- Appearance at start: light (the profile scene switches to Dark and back to Light).

## Scenes

| # | Time | On screen / action | Narration |
|---|---|---|---|
| 1 | 00:00 | Title card "What is the Textile Platform?", then the browser with textile-platform.ch (logged out, example collection). | Hello and welcome! In this series I'll show you the Textile Platform. It's a website where you design weave patterns and bead patterns right in your browser. In this first video you'll learn what the platform is, where it comes from, and how to create your own free account. Let's get started. |
| 2 | 00:28 | Screen recordings of the desktop programs: DB-WEAVE with a draft (threading, tie-up, treadling, fabric), then JBead with a bead rope pattern. Caption "Brunold Software — DB-WEAVE · JBead". | The Textile Platform is built on two programs from Brunold Software, a small Swiss developer of free design tools. The first one is DB-WEAVE. It's weaving software for dobby looms, also called shaft looms. You design the threading, the tie-up and the treadling, and DB-WEAVE shows you the resulting fabric. The second one is JBead. It's a design tool for bead crochet ropes. You draw the pattern on a grid, and JBead shows how the finished rope will look and in which order to thread the beads. Both programs are free and open source, and they run on Windows, macOS and Linux. |
| 3 | 01:18 | Simple graphic: a desktop computer, a laptop and a tablet, each showing the same pattern in the browser; below it three icons: groups, sharing, chat. | So why a website? Desktop programs have to be installed, and they don't run on a tablet. The Textile Platform brings the same design functionality to your browser. There's nothing to install, and it works on any device, including tablets. Your patterns are stored online, so you can continue on another computer at any time. And the platform adds something the desktop programs can't do: you can create groups, share patterns with other people and chat with them. That's useful for weaving courses, guilds, or simply for friends who design together. |
| 4 | 02:03 | Browser: open textile-platform.ch (logged out). The home page shows the public example collection. Scroll from **DB-WEAVE Patterns** down to **JBead Patterns**. Click a weave example → it opens read-only. Click **Close**. Click a bead example → read-only bead editor. Click **Close**. | Let's have a look. When you open textile-platform.ch without being logged in, you see a public collection of example patterns. At the top are the DB-WEAVE patterns, further down the JBead patterns. You can open any of them, even without an account. Here is a weave pattern. You see the complete draft: threading, tie-up, treadling and the fabric. This pattern belongs to someone else, so it opens read-only. You can look at everything, but you can't change it. Close takes you back. And here is a bead pattern. On the left the draft, next to it the corrected view and the simulation of the finished rope. Close again. |
| 5 | 03:00 | Click **Register** (top right). Page **Create Account**. Fill in **Name** "Carla Sample", **E-Mail** "carla.sample@example.com", **Password**, **Confirm Password**, then the result of the calculation shown under "Please enter the result of the following calculation". Click **Create**. | To design your own patterns, you need a free account. Click Register at the top right. The page is called Create Account. First the name. This is the name other users will see. I'll type Carla Sample. From this name, the platform also creates the short web address of your patterns, here carla-sample. Next the e-mail address. Then a password with at least eight characters, and the same password again under Confirm Password. Finally a small calculation. It makes sure that a real person is registering and not a robot. I'll enter the result and click Create. |
| 6 | 03:56 | Page **Verification pending** with the e-mail address (helper box out of frame). Switch to the inbox tab: open the e-mail "Confirm your Textile-Platform account", click the link. Page **Verification successful** → click **Log in**. | The page now says Verification pending. The platform has sent an e-mail to the address I entered. Let's open the mailbox. The e-mail is called Confirm your Textile-Platform account, and it contains a link. I click it, and the account is verified. If you can't find the e-mail, please check your spam folder. The page now says Verification successful. Click Log in. |
| 7 | 04:34 | Page **Log in**: type **E-Mail** and **Password**, point at **Recover password**, click **Log in**. | To log in, you use your e-mail address and your password, not your name. If you ever forget your password, click Recover password, and the platform sends you a link to set a new one. Now I click Log in. |
| 8 | 04:57 | Welcome popup **Welcome to the Textile Platform!** Highlight each bullet point while it is mentioned. Point at **Help** in the top bar. Click **Got it**. | On your first visit, a welcome message appears. It explains a few things. Two example patterns have been added to your account, one weave pattern and one bead pattern. If you have a question, you can write to the support user at any time. The Help link in the top bar opens exactly this chat. You can send direct messages to other users from their profile page. And you can create groups, invite others, share patterns and chat together. Click Got it to close the message. It won't appear again. |
| 9 | 05:40 | Carla's pattern page: point at "Double Weave" under **DB-WEAVE Patterns** and "Green Yellow Diagonal" under **JBead Patterns**. Click "Double Weave" → editor opens; click **Close**. | Now we're on Carla's own pattern page. Here are the two starter patterns: Double Weave in the DB-WEAVE section and Green Yellow Diagonal in the JBead section. They're your own copies, so you can open them, change them and experiment as much as you like. If you don't need them, simply delete them. We'll look at this page in detail in the next video. |
| 10 | 06:13 | Click the round profile button with the initials "CS" (top right) → **Profile**. In **Appearance** click **Dark**, then **System**, then **Light**. Open **Language** (System default / Deutsch / English), leave English. Open **Timezone**, choose "Europe/Zurich". Point at the read-only **Name** and **E-Mail**. Click **Save**. | One last stop: your profile. Click the round button with your initials at the top right. Under Appearance you choose Light, Dark or System. System simply follows the setting of your computer or tablet. Under Language you choose Deutsch or English. System default uses the language of your browser. The timezone controls how dates and times are shown, for example in messages. When everything fits, click Save. Your name at the top appears in the web addresses of your patterns. It and your e-mail address can only be changed by support. |
| 11 | 06:57 | Back on the pattern page (click the logo). End card with links to video 02 and video 10. | That's it for the first video. Carla now has an account, two starter patterns, and her settings are in place. Are you already using DB-WEAVE or JBead on the desktop? Then video 10 shows you how to bring your existing files to the platform. In the next video, we'll explore your pattern library: creating, uploading, sorting and managing patterns. See you there! |

## YouTube chapters

```
00:00 Welcome
00:28 DB-WEAVE and JBead
01:18 The idea of the Textile Platform
02:03 Public example patterns
03:00 Creating an account
03:56 Verifying your e-mail address
04:34 Logging in
04:57 The welcome message
05:40 Your two starter patterns
06:13 Profile: appearance, language, timezone
06:57 What's next
```

## Next video

**02 — Your pattern library:** creating and uploading patterns, filtering and sorting, and the actions for renaming, publishing, downloading, cloning and deleting patterns. Desktop users: see also **10 — For DB-WEAVE and JBead desktop users**.
