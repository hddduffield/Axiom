// Plan generation upload (/plans/generate)
//
// API contract surface (v1 — deferred CLI pattern):
//   POST /plans/generate
//     body: {
//       client_id:                string  (uuid)
//       fact_review_filename:     string  (e.g. "holloway_fr_2026-04-21.docx")
//       client_profile_json:      JSON    (parsed ClientProfile shape)
//       selected_recommendations_json: JSON  (parsed SelectedRecommendations shape)
//     }
//     → 202 Accepted { plan_id, status: "queued" }
//
// IMPORTANT: This endpoint queues a plan. The orchestrator runs locally
// on Hayden's machine (CLI). The advisor will not see results immediately —
// they must wait for Hayden to process the queue and the plan to land in
// "ready_for_review" state. Success state below makes this explicit so
// nobody refreshes the page expecting an instant draft.

function PlanGenerate() {
  const D = window.AXIOM_DATA;
  const [clientId, setClientId]       = React.useState("");
  const [frFilename, setFrFilename]   = React.useState("");
  const [profileFile, setProfileFile] = React.useState(null);
  const [recsFile, setRecsFile]       = React.useState(null);
  const [profileJson, setProfileJson] = React.useState(null);
  const [recsJson, setRecsJson]       = React.useState(null);
  const [profileErr, setProfileErr]   = React.useState(null);
  const [recsErr, setRecsErr]         = React.useState(null);
  const [submitting, setSubmitting]   = React.useState(false);
  const [submitted, setSubmitted]     = React.useState(null); // { plan_id, client_id, queued_at }
  const [error, setError]             = React.useState(null);

  const client = D.CLIENTS.find(c => c.id === clientId);
  const lead = client && getAdvisor(client.lead_advisor_id);

  // Auto-suggest fact_review filename when client picked
  React.useEffect(() => {
    if (!client || frFilename) return;
    const slug = client.household_name.toLowerCase().split(/\s+/)[0];
    const today = new Date().toISOString().slice(0, 10);
    setFrFilename(`${slug}_fr_${today}.docx`);
  }, [clientId]);

  const onProfilePick = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setProfileFile(f);
    setProfileErr(null);
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        setProfileJson(parsed);
      } catch (err) {
        setProfileErr(`Could not parse JSON: ${err.message}`);
        setProfileJson(null);
      }
    };
    r.readAsText(f);
  };

  const onRecsPick = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setRecsFile(f);
    setRecsErr(null);
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        setRecsJson(parsed);
      } catch (err) {
        setRecsErr(`Could not parse JSON: ${err.message}`);
        setRecsJson(null);
      }
    };
    r.readAsText(f);
  };

  const canSubmit = clientId && frFilename && profileJson && recsJson && !submitting;

  const onSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    // Mock POST /plans/generate. In v1 this returns immediately with
    // a plan_id and queued status; orchestrator runs offline.
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted({
        plan_id: `mock-plan-${client.id.replace("mock-client-", "")}-pending`,
        client_id: client.id,
        client_name: client.household_name,
        queued_at: new Date().toISOString(),
        fr_filename: frFilename,
      });
    }, 700);
  };

  const reset = () => {
    setClientId(""); setFrFilename("");
    setProfileFile(null); setRecsFile(null);
    setProfileJson(null); setRecsJson(null);
    setProfileErr(null); setRecsErr(null);
    setSubmitted(null); setError(null);
  };

  // ─── Success state ─────────────────────────────────
  if (submitted) {
    return (
      <div className="page" data-screen-label="11 Plan generate · queued">
        <PageHead
          crumbs={[{ label: "Plans", to: "/clients" }, { label: "Generate" }]}
          title="Plan queued"
          subtitle={<><span className="mono">{submitted.plan_id}</span> · {submitted.client_name}</>}
        />

        <div style={{ maxWidth: 640 }}>
          <div className="card" style={{ borderColor: "var(--s-green)", borderLeft: "3px solid var(--s-green)" }}>
            <div className="card__body">
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", background: "var(--s-green-bg)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--s-green)" }}>
                  <CheckIcon />
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>Plan queued. Hayden will process locally.</h2>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
                    The orchestrator runs on Hayden's machine via the CLI. This isn't an instant draft —
                    you'll see the plan land in <span className="mono">ready_for_review</span> once Hayden
                    processes the queue. Typical turnaround is same-day for runs submitted before 5pm ET.
                  </p>
                </div>
              </div>

              <div className="divider" style={{ margin: "16px 0" }} />

              <dl className="kv" style={{ gridTemplateColumns: "160px 1fr", fontSize: 12 }}>
                <dt>Plan ID</dt>          <dd className="mono">{submitted.plan_id}</dd>
                <dt>Client</dt>           <dd>{submitted.client_name} <span className="mono dim" style={{ fontSize: 11 }}>({submitted.client_id})</span></dd>
                <dt>Fact review</dt>      <dd className="mono">{submitted.fr_filename}</dd>
                <dt>Queued at</dt>        <dd className="mono">{new Date(submitted.queued_at).toISOString().replace("T", " ").slice(0, 19)} UTC</dd>
                <dt>Status</dt>           <dd><span className="badge badge--amber"><span className="dot"></span>Queued</span></dd>
              </dl>

              <div className="divider" style={{ margin: "16px 0" }} />

              <div className="dim" style={{ fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>What happens next</div>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "var(--text-2)", lineHeight: 1.7 }}>
                <li>Hayden's CLI picks up the queued payload.</li>
                <li>Orchestrator runs all four stages (extract → analyze → recommend → narrate).</li>
                <li>Resulting <span className="mono">stage4_output</span> JSONB is written to the plan record.</li>
                <li>Plan status flips to <span className="mono">ready_for_review</span>; you'll see it on the client's Plan tab.</li>
              </ol>
            </div>
            <div className="card__foot" style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <button className="btn" onClick={reset}>Queue another</button>
              <button className="btn btn--primary" onClick={() => navigate(`/clients/${submitted.client_id}`)}>
                Go to {submitted.client_name}
              </button>
            </div>
          </div>

          <div className="placeholder-block" style={{ marginTop: 16 }}>
            POST /plans/generate · returns 202 with plan_id + status:"queued" · orchestrator picks up via CLI
          </div>
        </div>
      </div>
    );
  }

  // ─── Form state ────────────────────────────────────
  return (
    <div className="page" data-screen-label="10 Plan generate">
      <PageHead
        crumbs={[{ label: "Plans", to: "/clients" }, { label: "Generate" }]}
        title="Generate plan"
        subtitle="Queue a new comprehensive wealth plan for orchestrator processing"
      />

      <form onSubmit={onSubmit} style={{ maxWidth: 760 }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card__head"><h2>1 · Client &amp; fact review</h2></div>
          <div className="card__body">
            <div className="field">
              <label htmlFor="pg-client">Client</label>
              <select id="pg-client" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="">Select household…</option>
                {D.CLIENTS.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.household_name} · {c.archetype} · {c.status}
                  </option>
                ))}
              </select>
              {client && (
                <div className="dim" style={{ fontSize: 11, fontFamily: "var(--font-mono)", marginTop: 2 }}>
                  {client.id} · lead: {lead?.first_name} {lead?.last_name[0]}. · AUM {fmtMoney(client.aum)}
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="pg-fr">Fact review filename</label>
              <input
                id="pg-fr"
                type="text"
                value={frFilename}
                onChange={(e) => setFrFilename(e.target.value)}
                placeholder="e.g. holloway_fr_2026-04-21.docx"
                style={{ fontFamily: "var(--font-mono)" }}
                required
              />
              <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
                Reference only — used as the source-of-truth filename in plan provenance. The .docx itself does not need to be uploaded here.
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card__head">
            <h2>2 · Upload payload JSON</h2>
            <span className="dim mono" style={{ fontSize: 11 }}>2 files required</span>
          </div>
          <div className="card__body">
            <FileField
              id="pg-profile"
              label="ClientProfile JSON"
              hint="Output of the discovery / fact-review stage. Validated as JSON on upload."
              file={profileFile}
              parsed={profileJson}
              error={profileErr}
              onPick={onProfilePick}
              shape="ClientProfile"
            />
            <FileField
              id="pg-recs"
              label="SelectedRecommendations JSON"
              hint="Curated rec set from the recommendation stage. Drives RB.* / RP.* sections."
              file={recsFile}
              parsed={recsJson}
              error={recsErr}
              onPick={onRecsPick}
              shape="SelectedRecommendations"
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16, background: "var(--surface-2)" }}>
          <div className="card__body" style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flexShrink: 0, marginTop: 1, color: "var(--text-2)" }}>
                <InfoIcon />
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.55 }}>
                <strong style={{ color: "var(--text)" }}>Deferred processing.</strong> Submitting queues a job —
                it does not generate the plan in your browser. The orchestrator runs locally on Hayden's machine
                via the PSA Wealth CLI. Expect a same-day turnaround for runs submitted before 5pm ET; you'll
                see the plan appear in <span className="mono">ready_for_review</span> on the client detail page.
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="card" style={{ marginBottom: 16, borderColor: "var(--s-red)", background: "var(--s-red-bg)" }}>
            <div className="card__body" style={{ fontSize: 12, color: "var(--s-red)" }}>{error}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          <span className="dim" style={{ fontSize: 11, marginRight: "auto" }}>
            {!clientId && "Select a client to begin."}
            {clientId && !profileJson && "Upload ClientProfile JSON."}
            {clientId && profileJson && !recsJson && "Upload SelectedRecommendations JSON."}
            {canSubmit && "Ready to queue."}
          </span>
          <button type="button" className="btn" onClick={() => navigate("/clients")}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
            {submitting ? "Queuing…" : <><FileIcon /> Queue plan</>}
          </button>
        </div>

        <div className="placeholder-block" style={{ marginTop: 24 }}>
          POST /plans/generate · body: &#123; client_id, fact_review_filename, client_profile_json, selected_recommendations_json &#125; · 202 Accepted
        </div>
      </form>
    </div>
  );
}

// ───────── Reusable file picker for JSON payloads ─────────
function FileField({ id, label, hint, file, parsed, error, onPick, shape }) {
  const sizeKb = file ? (file.size / 1024).toFixed(1) : null;
  const keyCount = parsed && typeof parsed === "object" ? Object.keys(parsed).length : null;
  const isArray = Array.isArray(parsed);

  return (
    <div className="field" style={{ marginBottom: 14 }}>
      <label htmlFor={id}>{label}</label>
      <div className="file-drop">
        <input id={id} type="file" accept=".json,application/json" onChange={onPick} />
        <label htmlFor={id} className="file-drop__inner">
          {!file ? (
            <>
              <UploadIcon />
              <span><strong>Click to upload</strong> or drop a <span className="mono">.json</span> file</span>
              <span className="dim" style={{ fontSize: 11 }}>Expected shape: <span className="mono">{shape}</span></span>
            </>
          ) : error ? (
            <>
              <FileIcon />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{file.name}</div>
                <div style={{ fontSize: 11, color: "var(--s-red)", marginTop: 2 }}>{error}</div>
              </div>
              <span className="badge badge--red"><span className="dot"></span>Invalid</span>
            </>
          ) : (
            <>
              <FileIcon />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{file.name}</div>
                <div className="dim" style={{ fontSize: 11, marginTop: 2, fontFamily: "var(--font-mono)" }}>
                  {sizeKb} KB · {isArray ? `array · ${parsed.length} items` : `object · ${keyCount} top-level keys`}
                </div>
              </div>
              <span className="badge badge--green"><span className="dot"></span>Parsed</span>
            </>
          )}
        </label>
      </div>
      <div className="dim" style={{ fontSize: 11 }}>{hint}</div>
    </div>
  );
}

// Inline icons local to this view
function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 10V3M8 3l-3 3M8 3l3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11v1.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V11" strokeLinecap="round" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="7" cy="7" r="5.5" />
      <path d="M7 6.5v3.5M7 4.5v.5" strokeLinecap="round" />
    </svg>
  );
}

Object.assign(window, { PlanGenerate });
