'use client'

import { loginAction } from "@/app/actions/auth"
import { useActionState } from "react"
import Link from "next/link"
import styles from "./login.module.css"

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined)

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>CollabEdit</h1>
          <p className={styles.subtitle}>Welcome back. Sign in to your workspace</p>
        </div>

        <form action={action} className={styles.form}>
          {state?.error && (
            <div className={styles.error}>
              {state.error}
            </div>
          )}

          <div className={styles.inputGroup}>
            <label htmlFor="email" className={styles.label}>Email Address</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className={styles.input}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder="••••••••"
              className={styles.input}
            />
          </div>

          <button type="submit" disabled={pending} className={styles.button}>
            {pending ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className={styles.footer}>
          Don&apos;t have an account?{" "}
          <Link href="/register" className={styles.link}>
            Sign up now
          </Link>
        </div>
      </div>
    </div>
  )
}
