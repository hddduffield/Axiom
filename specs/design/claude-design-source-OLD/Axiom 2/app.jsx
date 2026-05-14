// Main app — router + view dispatch + global drawer state.
const { useState: useStateApp, useEffect: useEffectApp } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "luxury",
  "showLuxuryRules": true,
  "density": "regular",
  "signinVariant": "split"
}/*EDITMODE-END*/;

function App() {
  const route = useRoute();
  const [drawerId, setDrawerId] = useStateApp(null);
  const [statusOverrides, setStatusOverrides] = useStateApp({});
  const [toast, setToast] = useStateApp(null);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffectApp(() => {
    document.body.classList.toggle("theme-luxury", tweaks.theme === "luxury");
    document.body.classList.toggle("density-compact", tweaks.density === "compact");
    document.body.classList.toggle("density-comfy",   tweaks.density === "comfy");
  }, [tweaks.theme, tweaks.density]);

  // Apply local status overrides on top of mock data, so "Mark complete"
  // appears to mutate immediately. (Server-side this is PATCH /api/action-items/[id].)
  useEffectApp(() => {
    Object.entries(statusOverrides).forEach(([id, status]) => {
      const a = window.AXIOM_DATA.ACTION_ITEMS.find(x => x.id === id);
      if (a) a.status = status;
    });
  }, [statusOverrides]);

  const onStatusChange = (id, status) => {
    setStatusOverrides(prev => ({ ...prev, [id]: status }));
    if (status === "complete") {
      setToast({ kind: "success", message: "Item complete. Derivative reminder will spawn (Phase 5d)." });
      setTimeout(() => setToast(null), 4000);
    }
  };

  const openActionItem = (id) => setDrawerId(id);
  const closeDrawer = () => setDrawerId(null);

  const parts = route.parts;
  const isAuth = parts[0] === "sign-in";

  if (isAuth) return (
    <>
      <SignIn variant={tweaks.signinVariant} />
      <TweaksPanel title="Tweaks">
        <TweakSection label="Sign-in variant" />
        <TweakSelect
          label="Layout"
          value={tweaks.signinVariant}
          options={[
            { value: "split",          label: "Split — classic navy ★" },
            { value: "modern-glass",    label: "Modern — glass card ★" },
            { value: "modern-glass-v2", label: "Modern — glass card v2" },
            { value: "modern-mesh",    label: "Modern — gradient mesh" },
            { value: "modern-asym",    label: "Modern — asymmetric curve" },
            { value: "split-bold",     label: "Split — bold wordmark" },
            { value: "split-inverted", label: "Split — inverted (form left)" },
            { value: "centered",       label: "Centered minimal" },
            { value: "editorial",  label: "Editorial wordmark" },
            { value: "letterhead", label: "Document letterhead" },
            { value: "dark",       label: "Dark mode" },
            { value: "ambient",    label: "Ambient status board" },
          ]}
          onChange={(v) => setTweak("signinVariant", v)}
        />
      </TweaksPanel>
    </>
  );

  let view;
  if (parts.length === 0 || parts[0] === "dashboard") {
    view = <Dashboard openActionItem={openActionItem} />;
  } else if (parts[0] === "clients" && !parts[1]) {
    view = <ClientsList />;
  } else if (parts[0] === "clients" && parts[1]) {
    view = <ClientDetail clientId={parts[1]} openActionItem={openActionItem} />;
  } else if (parts[0] === "action-items") {
    view = <ActionItems openActionItem={openActionItem} />;
  } else if (parts[0] === "notes") {
    view = <NotesHub />;
  } else if (parts[0] === "plans" && parts[1] === "generate") {
    view = <PlanGenerate />;
  } else if (parts[0] === "plans" && parts[1]) {
    view = <PlanView planId={parts[1]} />;
  } else {
    view = <div className="page"><PageHead title="Not found" subtitle={`No view at ${route.path}`} /></div>;
  }

  return (
    <>
      <Topbar route={route} />
      {view}
      <ActionItemDrawer
        id={drawerId}
        onClose={closeDrawer}
        onStatusChange={onStatusChange}
      />
      {toast && (
        <div className="axiom-toast">
          <CheckIcon />
          <span>{toast.message}</span>
        </div>
      )}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme" />
        <TweakRadio label="Aesthetic" value={tweaks.theme}
                    options={[{value:"default",label:"Default"},{value:"luxury",label:"Luxury"}]}
                    onChange={(v) => setTweak("theme", v)} />
        <TweakRadio label="Density" value={tweaks.density}
                    options={[{value:"compact",label:"Compact"},{value:"regular",label:"Regular"},{value:"comfy",label:"Comfy"}]}
                    onChange={(v) => setTweak("density", v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
