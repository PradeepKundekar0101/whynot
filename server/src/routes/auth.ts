import { Router, Request, Response } from "express";
import { z } from "zod";
import { createUser, loginUser, getUserById } from "../services/auth.service";
import { signAccessToken, verifyRefreshToken } from "../lib/jwt";
import { authenticate } from "../middleware/authenticate";
import { AuthenticatedRequest } from "../types";

const router = Router();

const signupSchema = z.object({
  email: z.string().email("Invalid email format"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1, "Display name is required").max(50, "Display name must be at most 50 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

router.post("/signup", async (req: Request, res: Response) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: parsed.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
    });
    return;
  }

  try {
    const result = await createUser(parsed.data);
    res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.status(201).json({
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
        displayName: result.user.displayName,
        avatarUrl: result.user.avatarUrl,
        bio: result.user.bio,
        isSellerEnabled: result.user.isSellerEnabled,
        walletBalance: result.user.walletBalance,
        createdAt: result.user.createdAt,
      },
      accessToken: result.accessToken,
    });
  } catch (err: any) {
    if (err.code === "P2002") {
      const field = err.meta?.target?.[0] || "field";
      res.status(409).json({
        error: {
          code: "CONFLICT",
          message: `${field} already in use`,
          details: [{ field, message: `This ${field} is already taken` }],
        },
      });
      return;
    }
    console.error("Signup error:", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: parsed.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
    });
    return;
  }

  try {
    const result = await loginUser(parsed.data.email, parsed.data.password);
    if (!result) {
      res.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" },
      });
      return;
    }

    res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
        displayName: result.user.displayName,
        avatarUrl: result.user.avatarUrl,
        bio: result.user.bio,
        isSellerEnabled: result.user.isSellerEnabled,
        walletBalance: result.user.walletBalance,
        createdAt: result.user.createdAt,
      },
      accessToken: result.accessToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
  }
});

router.post("/refresh", async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "No refresh token" },
    });
    return;
  }

  try {
    const payload = verifyRefreshToken(token);
    const user = await getUserById(payload.userId);
    if (!user) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "User not found" },
      });
      return;
    }
    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    res.json({ accessToken });
  } catch {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Invalid refresh token" },
    });
  }
});

router.get("/me", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const user = await getUserById(req.user!.userId);
  if (!user) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "User not found" },
    });
    return;
  }
  res.json({ user });
});

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("refreshToken", { path: "/" });
  res.json({ message: "Logged out" });
});

export default router;
