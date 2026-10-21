import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

/**
 * DRAFT privacy page, for review. It states only what the application verifiably does with data (from its code) and
 * quotes Google's published Gemini API terms. Every legal section is a placeholder to be written or approved by the
 * owner; nothing here is final policy wording.
 */

const Placeholder: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p data-placeholder className="text-sm text-amber-300 border border-dashed border-amber-500/40 rounded-lg px-3 py-2">
    [To be provided by AlgoFlow and reviewed before launch: {children}]
  </p>
);

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section aria-labelledby={id} className="space-y-3">
    <h2 id={id} className="text-lg font-bold text-ink">{title}</h2>
    {children}
  </section>
);

export const PrivacyPage: React.FC = () => (
  <main className="min-h-screen bg-page text-slate-200 px-4 py-10">
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="space-y-3">
        <Link to="/auth" className="text-xs font-mono text-cyan-400 underline underline-offset-2">Back to AlgoFlow</Link>
        <h1 className="text-3xl font-extrabold text-ink flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-cyan-400" aria-hidden="true" />
          Privacy Policy
        </h1>
        <div role="note" data-testid="privacy-draft-banner" className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Draft for review: this page is not yet AlgoFlow&apos;s privacy policy. It describes what the application does with
            data; the sections in brackets must be written and reviewed before launch.
          </span>
        </div>
        <Placeholder>who operates AlgoFlow (the data controller), contact details and the effective date</Placeholder>
      </div>

      <Section id="privacy-account" title="Your account">
        <p className="text-sm text-slate-300">
          When you create an account, AlgoFlow stores your name, e-mail address and a hashed (not readable) form of your
          password, your role, and your settings (theme, preferred programming language and daily study goal).
        </p>
      </Section>

      <Section id="privacy-learning" title="Your learning activity">
        <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
          <li>Visualizer activity: which algorithms you step through, how far, and on which day.</li>
          <li>Your progress and Learning Paths status, derived from that activity.</li>
          <li>Notes you write.</li>
          <li>Practice submissions: your code, its language and the verdict.</li>
          <li>How many code runs and AI Tutor questions you used each day (to apply daily limits).</li>
        </ul>
      </Section>

      <Section id="privacy-cookies" title="Cookies and storage on your device">
        <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
          <li>One sign-in cookie (HttpOnly, valid for 7 days), used only to keep you signed in.</li>
          <li>Your theme choice and your unsent Practice code drafts are kept in your browser&apos;s storage on this device. Drafts are not sent to AlgoFlow until you submit them.</li>
        </ul>
      </Section>

      <Section id="privacy-logs" title="Network addresses, audit records and server logs">
        <ul className="list-disc pl-5 text-sm text-slate-300 space-y-1">
          <li>
            The server uses the network (IP) address of each request to limit how often sign-in attempts and other requests
            can be made. These counts are kept only in the server&apos;s memory, not in the database.
          </li>
          <li>
            When an administrator changes a user&apos;s account status or role, or creates, edits or archives a practice
            problem, AlgoFlow records in an audit log the administrator&apos;s account, the action, the time and the IP
            address of the administrator&apos;s request. For a status or role change, the record also includes the affected
            user&apos;s account id and e-mail address and the old and new values.
          </li>
          <li>
            When the server cannot complete a request because of an error, it writes a diagnostic line to its log with the
            request method, the address requested (URL) and the error message. The URL can include what you typed into a
            search box or chose as a filter (for example, a search of your notes). The server does not deliberately log
            request contents, passwords or cookies, but the error message for a malformed request can quote part of it.
          </li>
        </ul>
        <Placeholder>where server logs are kept, by which hosting provider and for how long, and whether the hosting provider keeps its own request logs (which commonly include IP addresses)</Placeholder>
      </Section>

      <Section id="privacy-processors" title="Services that process data for AlgoFlow">
        <div className="space-y-2 text-sm text-slate-300">
          <h3 className="font-bold text-ink">Database hosting</h3>
          <p>Account and learning data are stored in a MongoDB database.</p>
          <Placeholder>the database provider and the region where data is stored</Placeholder>

          <h3 className="font-bold text-ink pt-2">Code execution (Playground and Practice)</h3>
          <p>
            When code execution is enabled, the programs you run or submit, and their input, are sent to the Judge0 code
            execution service to be compiled and run.
          </p>
          <Placeholder>the Judge0 provider used and a link to its terms and privacy policy</Placeholder>

          <h3 className="font-bold text-ink pt-2">AI Tutor (Google Gemini)</h3>
          <p>
            When the AI Tutor is enabled, your question, the earlier questions and answers of the same conversation, and the
            algorithm context (the algorithm, its input values, the current step and the code shown) are sent to Google&apos;s
            Gemini API to produce an answer. Your name, e-mail address and account id are not sent. AlgoFlow does not store
            the conversation: it is kept only in your browser while the page is open.
          </p>
          <Placeholder>whether AlgoFlow uses Gemini&apos;s unpaid (free) tier or a paid tier; Google&apos;s terms differ between them, and this section must describe the one actually used</Placeholder>
          <p>
            If the Google Cloud project AlgoFlow uses for the Gemini API has no billing enabled, the requests are an unpaid
            service. Google&apos;s{' '}
            <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer" className="text-cyan-400 underline underline-offset-2">
              Gemini API Additional Terms of Service
            </a>{' '}
            state that, for unpaid services, Google uses the content submitted and the responses &ldquo;to provide, improve,
            and develop&rdquo; its products and machine learning technologies, that &ldquo;human reviewers may read, annotate,
            and process your API input and output&rdquo;, and that users should not submit &ldquo;sensitive, confidential, or
            personal information&rdquo;. Please don&apos;t include personal information in your questions.
          </p>
          <Placeholder>whether this description is complete, and links to Google&apos;s privacy policy</Placeholder>
        </div>
      </Section>

      <Section id="privacy-retention" title="How long data is kept">
        <Placeholder>retention periods for accounts, learning data, submissions and logs, and what happens when an account is deleted</Placeholder>
      </Section>

      <Section id="privacy-rights" title="Your rights and choices">
        <Placeholder>how to access, correct, export or delete your data, and how to contact AlgoFlow about privacy</Placeholder>
      </Section>

      <Section id="privacy-legal" title="Legal basis, transfers and changes">
        <Placeholder>the legal basis for processing, international data transfers, rules on who may use AlgoFlow, and how changes to this policy are announced</Placeholder>
      </Section>
    </div>
  </main>
);
