# Tugg

**Pay to pull. Pick a side.**

A global rivalry rope. Every dollar drags it toward your team. Rounds close, winners get a badge, and every dollar ever pulled stays on the all-time score.

No prizes. No payouts. No betting. Just bragging rights.

**→ [tugg.lol](https://tugg.lol)**

## How it works

Pick a rivalry — Messi vs Ronaldo, Arsenal vs Dortmund, Pizza vs Burgers. Pick a side. Pull.

- $1 per pull, in bundles of 5, 10, 25, or any amount you choose
- Each dollar moves the rope toward your side
- Rounds run daily or weekly and close at 00:00 UTC
- Whoever's ahead when the round closes takes it
- All-time scores never reset

Anyone can create a rivalry. Trending ones are generated automatically from what people are arguing about.

## Stack

React, TypeScript and TanStack Start on Cloudflare Workers, with Postgres and row-level security on Supabase. Payments run through Dodo Payments as merchant of record; transactional email through Resend.

Built with [Lovable](https://lovable.dev).

## Development

```sh
git clone https://github.com/bhushanshisode05-byte/tugg-lol.git
cd tugg-lol
npm install
npm run dev
