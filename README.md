# AI Agent Workflow Builder

A production-quality mini n8n-style AI workflow builder using Next.js, Nhost (Hasura + Postgres), and Gemini API.

## Features
- **Multi-tenant Organizations:** Strict RBAC across Owner, Editor, and Viewer roles.
- **Workflow Builder:** A vertical ordered timeline editor.
- **Hasura Actions & Event Triggers:** Robust, transactional backend execution.
- **System Webhooks:** Isolated trusted execution context separate from user context.
- **Quota Management:** Check-before-run semantics.
- **GraphQL Subscriptions:** Live execution monitoring.

## 1. Nhost Setup
1. Create a new project in [Nhost Cloud](https://nhost.io).
2. Install the Nhost CLI globally: `npm install -g nhost-cli`
3. Connect your local repository to the Nhost Cloud project:
   ```bash
   nhost login
   nhost link
   ```
4. Push the local database migrations and Hasura metadata to your Nhost Cloud instance:
   ```bash
   nhost push
   ```
   *(This ensures that the `public` schema tables, relationships, permissions, and Hasura Actions are correctly deployed to your cloud instance).*

## 2. Environment Variables
Create a `.env.local` file in the root of this project (this file is git-ignored):
```env
NEXT_PUBLIC_NHOST_SUBDOMAIN=your_nhost_subdomain_here
NEXT_PUBLIC_NHOST_REGION=your_nhost_region_here
NHOST_ADMIN_SECRET=your_admin_secret_here
GEMINI_API_KEY=your_gemini_api_key_here
NEXT_PUBLIC_APP_URL=https://your-production-url.vercel.app
```
*Note: `NHOST_ADMIN_SECRET` and `GEMINI_API_KEY` are NEVER exposed to the frontend browser (`NEXT_PUBLIC_`). They are strictly used server-side.*

## 3. Gemini API Setup
1. Get a Gemini API key from Google AI Studio.
2. Add it to the `GEMINI_API_KEY` environment variable. The backend uses the `gemini-3.6-flash` model by default.

## 4. Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```

## 5. Vercel Deployment
1. Import the repository into Vercel.
2. In the Vercel project settings, set the **Environment Variables** exactly as they appear in `.env.local`.
3. Deploy!
4. **Important**: Remember to update the `NEXT_PUBLIC_APP_URL` in both Vercel and your Nhost Environment Variables (if using webhooks) to match your final Vercel domain so that Hasura Actions can correctly route the HTTP calls to your Next.js server-side functions.

## 6. Webhook Usage
You can trigger a workflow programmatically via a Webhook:
1. In the Workflow Builder, check "Enable Webhook" (Available to Owners only).
2. Enter a secret token.
3. Save the workflow.
4. Issue a POST request:
   ```bash
   curl -X POST https://your-domain.com/api/webhooks/<WORKFLOW_ID> \
     -H "Authorization: Bearer <YOUR_SECRET>" \
     -H "Content-Type: application/json" \
     -d '{"input_key": "value"}'
   ```

## 7. Running the Final Demo Scenario
Once deployed, verify the system functionality:
1. **Create Seed Users:** Sign up via the Nhost authentication UI.
2. **Setup Orgs:** The first sign-up will create an organization where the user is `owner`.
3. **Build the Workflow:**
   - **LLM Call:** Prompt: "Extract the core sentiment of the user input."
   - **HTTP Request:** POST to `https://httpbin.org/post` with the LLM output.
   - **Conditional Branch:** Check if output contains "positive".
   - **Approval Gate:** Owner/editor approval required.
   - **DB Write:** Save to database.
   - **Notify:** Alert the team.
4. **Execute:** 
   - Click "Run Now". 
   - Navigate to the Live Monitor and observe the timeline transition states.
   - Watch the `approval_gate` pause the execution.
   - Click "Approve" (as the owner) to resume and finalize the quota decrement.
