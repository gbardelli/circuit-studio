import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ClerkProvider, SignIn, useAuth, useUser } from '@clerk/react';
import { CLERK_KEY, setSession } from '../cloud';
import { TEMPLATES } from '../collab/templates';
import { templateSnapshot } from '../collab/applyTemplate';
import { Logo, Wordmark } from './Logo';
import { CircuitPreview } from './Preview';

const appearance = {
  variables: {
    colorPrimary: '#3b9eff',
    colorBackground: '#0e0f11',
    colorForeground: '#f5f6f7',
    colorText: '#f5f6f7',
    colorMutedForeground: '#a2a6ad',
    colorTextSecondary: '#a2a6ad',
    colorInput: '#151619',
    colorInputBackground: '#151619',
    colorInputForeground: '#f5f6f7',
    colorInputText: '#f5f6f7',
    colorNeutral: '#f5f6f7',
    colorDanger: '#ff453a',
    colorSuccess: '#30d158',
    borderRadius: '8px',
    fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif',
    fontSize: '14px',
  },
  elements: {
    card: { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(255,255,255,0.1), 0 24px 48px -16px rgba(0,0,0,0.7)' },
    headerTitle: { letterSpacing: '-0.03em' },
  },
} as never;

export function CloudShell({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={CLERK_KEY!} appearance={appearance} afterSignOutUrl="/">
      <SessionGate>{children}</SessionGate>
    </ClerkProvider>
  );
}

function SessionGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    setSession(
      () => getToken(),
      user
        ? {
            id: user.id,
            name: user.fullName || user.username || user.primaryEmailAddress?.emailAddress.split('@')[0] || 'Sin nombre',
            image: user.imageUrl ?? null,
          }
        : null,
    );
    setReady(true);
  }, [isLoaded, user, getToken]);

  if (!isLoaded || (isSignedIn && (!ready || !user))) return <Splash />;
  if (!isSignedIn) return <SignInScreen />;
  return <>{children}</>;
}

function Splash() {
  return (
    <div className="splash">
      <Logo size={40} />
    </div>
  );
}

function SignInScreen() {
  const preview = useMemo(() => templateSnapshot(TEMPLATES.find((t) => t.id === 'traffic')!), []);
  return (
    <div className="auth">
      <section className="auth-art" aria-hidden="true">
        <div className="auth-brand">
          <Logo size={34} />
          <Wordmark size={21} />
        </div>
        <div className="auth-stage">
          <CircuitPreview snapshot={preview} pad={20} />
        </div>
        <h1>Circuitos con Arduino, en el navegador y en equipo.</h1>
        <p>Monta en la protoboard, programa y simula. Comparte el enlace y editad a la vez.</p>
      </section>
      <section className="auth-form">
        <SignIn routing="hash" />
      </section>
    </div>
  );
}
