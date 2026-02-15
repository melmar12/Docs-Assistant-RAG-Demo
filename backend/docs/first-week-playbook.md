---
topics: [onboarding, process, culture]
owning_team: engineering
---

# Your First Week as a Software Engineer

This playbook gives you a rough outline of what your first week at ABC Corp should look like. It's not a rigid schedule — things will shift depending on your team and what's going on that sprint. But it should keep you oriented.

## Day 1: Get Set Up

Your first day is mostly logistics and setup.

- **Laptop and accounts:** IT should have your laptop ready. If something's missing, ping `#it-help` in Slack. You'll need access to:
  - GitHub (abc-corp org)
  - Slack
  - Jira (or Linear, depending on your team)
  - AWS console (read-only to start — your manager can request elevated access later)
  - Figma (view access)
- **Dev environment:** Follow the Local Development Environment Setup doc to get the app running locally. This usually takes a couple of hours, including debugging the inevitable Docker issue.
- **Meet your onboarding buddy:** They'll walk you through team norms, Slack channels, and anything else that doesn't fit neatly into a doc.

Don't worry if you don't finish everything on Day 1. Getting your environment working and meeting your team is enough.

## Day 2: Explore the Codebase

Now that things are (hopefully) running locally:

- **Read the System Architecture Overview** doc to understand how the pieces fit together
- **Browse the repo.** Open the code, poke around. Look at recent PRs from your team to see what kind of work they've been doing.
- **Try hitting a few API endpoints** locally using the Swagger UI at `http://localhost:8000/docs`
- **Read a few open Jira tickets** for your team to get a sense of the current sprint

Your onboarding buddy should have a short list of "good first issues" for you. These are intentionally small — fixing a typo, updating a label, adding a simple validation. The goal is to get you through the PR process, not to ship a major feature.

## Day 3–4: Your First PR

Pick up one of those starter tickets and aim to get a PR open by end of Day 3 or early Day 4.

- Follow the Git workflow described in the Repository Structure and Git Workflows doc
- Don't stress about writing perfect code — the point is to go through the cycle: branch, code, test, PR, review, merge
- If you get stuck, ask. Seriously. Nobody expects you to figure everything out solo in your first week.

While your PR is in review, keep reading. Some things worth looking at:

- The `CODEOWNERS` file to understand who owns what
- Any team-specific docs your manager points you to
- The on-call runbook (you won't be on-call yet, but it's good context)

## Day 5: Wrap Up and Reflect

By the end of your first week, you should have:

- [x] A working local dev environment
- [x] A basic understanding of the architecture and codebase
- [x] At least one PR opened (ideally merged)
- [x] Met your immediate team and onboarding buddy
- [x] Access to all the tools you need

Have a quick chat with your manager at the end of the week. This is a good time to:

- Share what went well and what was confusing
- Ask about the team's priorities for the next sprint
- Clarify your goals for the first month

## A Few Tips

- **Take notes.** You'll forget half of what you learn in week one. That's normal. Write things down.
- **Update the docs.** If you find something that's wrong or missing in any of these onboarding docs, fix it or tell someone. You have the freshest perspective right now.
- **Don't compare yourself to people who've been here for years.** Ramp-up takes time. Most people say they feel genuinely productive around week 4–6.
- **Expense your lunch.** During your first week, team meals are usually covered. Check the expense policy doc for details on what's reimbursable and how to submit.

## Meetings You'll Probably Be Invited To

- **Daily standup** — 15 minutes, usually morning. Say what you're working on, mention if you're blocked.
- **Sprint planning** — beginning of each sprint. You'll mostly observe the first one.
- **Retro** — every other Friday. Casual. Say what's on your mind.
- **1:1 with your manager** — weekly or biweekly, depending on preference. This is your time.

_Last updated: 2025-11-02_
