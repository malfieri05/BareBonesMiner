This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Create a `.env.local` file with your SearchAPI key:

```bash
SEARCHAPI_KEY=your_searchapi_key
OPENAI_API_KEY=your_openai_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
RESEND_API_KEY=your_resend_api_key
REPORT_FROM_EMAIL=reports@yourdomain.com
```

For Vercel deployments, add the same variables in the Vercel project settings
under Environment Variables so builds can access them.

## Supabase setup (for saved clips)

Run this SQL in your Supabase project to store mined clips per user:

```sql
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.folders enable row level security;

create policy "Users can read their folders"
on public.folders for select
using (auth.uid() = user_id);

create policy "Users can create their folders"
on public.folders for insert
with check (auth.uid() = user_id);

create policy "Users can update their folders"
on public.folders for update
using (auth.uid() = user_id);

create table if not exists public.mined_clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  video_id text not null,
  title text not null,
  transcript text not null,
  analysis text not null,
  action_plan jsonb not null,
  category text not null default 'Other',
  folder_id uuid references public.folders(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.mined_clips enable row level security;

create policy "Users can read their clips"
on public.mined_clips for select
using (auth.uid() = user_id);

create policy "Users can create their clips"
on public.mined_clips for insert
with check (auth.uid() = user_id);

create policy "Users can update their clips"
on public.mined_clips for update
using (auth.uid() = user_id);

create table if not exists public.report_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  frequency text not null,
  time_of_day text not null,
  day_of_week text,
  timezone text not null,
  last_sent_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.report_preferences enable row level security;

drop policy if exists "Users can read their report prefs" on public.report_preferences;
drop policy if exists "Users can upsert their report prefs" on public.report_preferences;

create policy "Users can read their report prefs"
on public.report_preferences for select
using (auth.uid() = user_id);

create policy "Users can upsert their report prefs"
on public.report_preferences for insert
with check (auth.uid() = user_id);

create policy "Users can update their report prefs"
on public.report_preferences for update
using (auth.uid() = user_id);
```

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Paste a YouTube Shorts or standard video URL and the app will fetch the transcript from SearchAPI.

API endpoint used by the UI:

```
POST /api/transcript
{
  "url": "https://www.youtube.com/shorts/aqz-KE-bpKQ"
}
```

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
