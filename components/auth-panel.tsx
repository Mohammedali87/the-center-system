"use client";

import Image from "next/image";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  KeyRound,
  Loader2,
  Menu,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  X
} from "lucide-react";
import { Button, Field, Input } from "./ui";

const services = [
  {
    icon: ReceiptText,
    title: "Bookkeeping",
    description: "Clear, organized books that give you an accurate view of your business."
  },
  {
    icon: FileText,
    title: "Tax preparation",
    description: "Reliable personal and business tax support, prepared with care."
  },
  {
    icon: Building2,
    title: "Business licensing",
    description: "Guidance through registrations, renewals, and the paperwork in between."
  },
  {
    icon: UsersRound,
    title: "Payroll support",
    description: "Practical payroll help that keeps your team and records on track."
  }
];

const benefits = [
  "One dependable place for essential business services",
  "Clear communication and organized records",
  "Support shaped around your business needs"
];

export function AuthPanel() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function submit(formData: FormData) {
    setError("");
    setPending(true);
    formData.set("flow", mode);
    try {
      await signIn("password", formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setPending(false);
    }
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f6f2] text-ink">
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
          <a href="#top" className="rounded-lg bg-white px-3 py-2 shadow-sm">
            <Image
              src="/center-business-logo.png"
              alt="Center Business Services"
              width={180}
              height={58}
              className="h-auto w-36 object-contain sm:w-40"
              priority
            />
          </a>

          <nav className="hidden items-center gap-8 text-sm font-medium text-white/75 md:flex">
            <a href="#services" className="transition hover:text-white">Services</a>
            <a href="#about" className="transition hover:text-white">Why us</a>
            <a href="#workspace" className="transition hover:text-white">Workspace</a>
            <a
              href="#workspace"
              className="rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-white transition hover:bg-white hover:text-ink"
            >
              Client sign in
            </a>
          </nav>

          <button
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-white md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen ? (
          <nav className="mx-5 grid gap-1 rounded-2xl border border-white/10 bg-[#101c19] p-3 text-sm font-medium text-white shadow-2xl md:hidden">
            <a href="#services" onClick={closeMenu} className="rounded-xl px-4 py-3 hover:bg-white/10">Services</a>
            <a href="#about" onClick={closeMenu} className="rounded-xl px-4 py-3 hover:bg-white/10">Why us</a>
            <a href="#workspace" onClick={closeMenu} className="rounded-xl bg-[#d8a44c] px-4 py-3 text-ink">Client sign in</a>
          </nav>
        ) : null}
      </header>

      <section id="top" className="relative isolate flex min-h-[760px] items-end overflow-hidden bg-[#10211c] pt-32 text-white">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -right-24 -top-32 h-[620px] w-[620px] rounded-full border border-white/10" />
          <div className="absolute -right-4 -top-16 h-[460px] w-[460px] rounded-full border border-white/10" />
          <div className="absolute right-28 top-20 h-[260px] w-[260px] rounded-full bg-[#d8a44c]/15 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-64 w-full bg-gradient-to-t from-black/25 to-transparent" />
        </div>

        <div className="mx-auto grid w-full max-w-7xl items-end gap-12 px-5 pb-16 lg:grid-cols-[1.12fr_.88fr] lg:px-8 lg:pb-20">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#e8c27f]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#e8c27f]" />
              Business made manageable
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              More time to build.
              <span className="block text-[#e8c27f]">Less time on paperwork.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-white/65 sm:text-lg">
              Bookkeeping, tax preparation, payroll, and licensing support for business owners who want clarity and room to grow.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="#workspace"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[#d8a44c] px-6 text-sm font-semibold text-[#17241f] transition hover:bg-[#e8c27f]"
              >
                Open your workspace
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#services"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/20 px-6 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Explore services
              </a>
            </div>
          </div>

          <div className="relative hidden min-h-[420px] lg:block">
            <div className="absolute bottom-0 right-0 w-[92%] rounded-[2rem] border border-white/10 bg-white/[0.07] p-5 shadow-2xl backdrop-blur-md">
              <div className="rounded-[1.4rem] bg-[#f7f6f2] p-5 text-ink">
                <div className="flex items-center justify-between border-b border-black/10 pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted">Your business</p>
                    <p className="mt-1 text-lg font-semibold">Everything in one place</p>
                  </div>
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-[#d8a44c]/20 text-[#8a641e]">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {["Books organized", "Taxes prepared", "Payroll supported", "Licenses tracked"].map((item, index) => (
                    <div key={item} className="rounded-2xl border border-black/5 bg-white p-4">
                      <div className="mb-5 flex items-center justify-between">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e6f0eb] text-[#2b6651]">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-xs text-muted">0{index + 1}</span>
                      </div>
                      <p className="text-sm font-semibold">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute bottom-14 left-0 rounded-2xl border border-white/10 bg-[#d8a44c] p-5 text-[#17241f] shadow-xl">
              <p className="text-3xl font-semibold">4-in-1</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider">Business support</p>
            </div>
          </div>
        </div>
      </section>

      <section id="services" className="px-5 py-20 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#98702b]">How we help</p>
              <h2 className="mt-4 max-w-lg text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
                The essentials, handled with care.
              </h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-muted lg:justify-self-end">
              Running a business comes with enough decisions. We help take the recurring financial and administrative work off your plate.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((service, index) => {
              const Icon = service.icon;
              return (
                <article key={service.title} className="group rounded-[1.5rem] border border-[#deddd6] bg-white p-6 transition hover:-translate-y-1 hover:shadow-soft">
                  <div className="flex items-start justify-between">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8eee9] text-[#285b49]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-semibold text-[#b5b4ad]">0{index + 1}</span>
                  </div>
                  <h3 className="mt-8 text-lg font-semibold">{service.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">{service.description}</p>
                  <a href="#workspace" className="mt-7 inline-flex items-center gap-1 text-sm font-semibold text-[#285b49]">
                    Get support <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </a>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="about" className="bg-white px-5 py-20 sm:py-24 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-2 lg:items-center">
          <div className="relative min-h-[470px] overflow-hidden rounded-[2rem] bg-[#173328] p-7 text-white sm:p-10">
            <div className="absolute -bottom-28 -right-24 h-96 w-96 rounded-full border border-white/10" />
            <div className="absolute -bottom-12 -right-4 h-64 w-64 rounded-full border border-white/10" />
            <div className="relative flex h-full min-h-[390px] flex-col justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#e8c27f]">
                <ShieldCheck className="h-4 w-4" />
                Built on trust
              </div>
              <blockquote className="max-w-lg text-3xl font-medium leading-tight tracking-[-0.035em] sm:text-4xl">
                &ldquo;Good business support should bring clarity, not add complexity.&rdquo;
              </blockquote>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                  <p className="text-2xl font-semibold text-[#e8c27f]">One team</p>
                  <p className="mt-1 text-sm text-white/60">Across your core needs</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                  <p className="text-2xl font-semibold text-[#e8c27f]">Real-time</p>
                  <p className="mt-1 text-sm text-white/60">Workspace visibility</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:pl-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#98702b]">Why Center Business Services</p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
              Practical help. Personal attention.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted">
              We combine everyday business know-how with an organized, modern process. You get straightforward answers, dependable support, and a clearer picture of what comes next.
            </p>
            <div className="mt-8 grid gap-4">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-center gap-3 border-b border-line pb-4 text-sm font-semibold">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[#3c725d]" />
                  {benefit}
                </div>
              ))}
            </div>
            <a href="#workspace" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#285b49]">
              Access your secure workspace <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <section id="workspace" className="bg-[#ecebe5] px-5 py-20 sm:py-24 lg:px-8">
        <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-soft lg:grid-cols-[.9fr_1.1fr]">
          <div className="flex flex-col justify-between bg-[#10211c] p-7 text-white sm:p-10">
            <div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#d8a44c] text-[#17241f]">
                <BriefcaseBusiness className="h-5 w-5" />
              </div>
              <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-[#e8c27f]">Secure workspace</p>
              <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.035em]">
                Keep work moving, all in one place.
              </h2>
              <p className="mt-5 max-w-md text-sm leading-6 text-white/60">
                Sign in to view jobs, clients, payments, reports, services, and team activity in real time.
              </p>
            </div>
            <div className="mt-10 grid gap-3 text-sm text-white/70 sm:grid-cols-3 lg:grid-cols-1">
              {["Live job tracking", "Payment visibility", "Role-based access"].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#e8c27f]" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <div className="mb-7">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#98702b]">Welcome back</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">Access your account</h3>
            </div>

            <div className="mb-6 flex rounded-xl border border-line bg-panel p-1">
              <button
                type="button"
                className={`h-10 flex-1 rounded-lg px-3 text-sm font-medium transition ${
                  mode === "signIn" ? "bg-white text-ink shadow-sm" : "text-muted"
                }`}
                onClick={() => setMode("signIn")}
              >
                Sign in
              </button>
              <button
                type="button"
                className={`h-10 flex-1 rounded-lg px-3 text-sm font-medium transition ${
                  mode === "signUp" ? "bg-white text-ink shadow-sm" : "text-muted"
                }`}
                onClick={() => setMode("signUp")}
              >
                Create account
              </button>
            </div>

            <form action={submit} className="grid gap-4">
              {mode === "signUp" ? (
                <Field label="Name">
                  <Input name="name" placeholder="Your full name" required />
                </Field>
              ) : null}
              <Field label="Email">
                <Input name="email" type="email" placeholder="you@company.com" required />
              </Field>
              <Field label="Password">
                <Input name="password" type="password" placeholder="8 characters or more" required />
              </Field>
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              ) : null}

              <Button type="submit" disabled={pending} className="mt-1 h-11 rounded-xl bg-[#173328] hover:bg-[#10211c]">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {mode === "signIn" ? "Sign in securely" : "Create account"}
              </Button>
            </form>

          </div>
        </div>
      </section>

      <footer className="bg-[#10211c] px-5 py-8 text-white lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="rounded-lg bg-white px-3 py-2">
            <Image
              src="/center-business-logo.png"
              alt="Center Business Services"
              width={160}
              height={50}
              className="h-auto w-32 object-contain"
            />
          </div>
          <p className="text-xs text-white/45">Bookkeeping, tax, payroll, and business support.</p>
          <a href="#top" className="text-xs font-semibold uppercase tracking-wider text-[#e8c27f]">Back to top</a>
        </div>
      </footer>
    </main>
  );
}
