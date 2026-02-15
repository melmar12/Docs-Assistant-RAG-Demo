# Onboarding Guide

Welcome to the team! This guide will help you get started.

## First Day

1. Set up your development environment
2. Get access to GitHub, Slack, and Jira
3. Meet your team lead and buddy

## Development Setup

Clone the main repository and install dependencies:

```bash
git clone https://github.com/our-org/main-app.git
cd main-app
npm install
```

Make sure you have Node.js 18+ and Docker installed.

## Code Review Process

All changes must go through a pull request. At least one approval is required before merging. Use conventional commits for your commit messages.

## Deployment

We deploy to staging automatically on merge to `main`. Production deploys happen every Tuesday and Thursday via the release pipeline.
