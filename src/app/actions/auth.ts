"use server"

import { signIn, signOut } from "@/auth"
import prisma from "@/lib/prisma"
import { hashPassword } from "@/lib/auth"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"

export async function loginAction(prevState: any, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: "Please enter your email and password." }
  }

  let isSuccessful = false

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
    isSuccessful = true
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Invalid email or password." }
        default:
          return { error: "Something went wrong. Please try again." }
      }
    }
    return { error: "Authentication failed. Please try again." }
  }

  if (isSuccessful) {
    redirect("/")
  }
}

export async function registerAction(prevState: any, formData: FormData) {
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!name || !email || !password) {
    return { error: "All fields are required." }
  }

  let isSuccessful = false

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
    })

    if (existing) {
      return { error: "Email is already registered." }
    }

    const passwordHash = await hashPassword(password)
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
      },
    })

    // Sign in the newly registered user
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
    isSuccessful = true
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Registration succeeded but sign-in failed. Please log in." }
    }
    return { error: "Registration failed. Please try again." }
  }

  if (isSuccessful) {
    redirect("/")
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" })
}
