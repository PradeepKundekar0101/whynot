import bcrypt from "bcrypt";
import prisma from "../lib/prisma";
import { signAccessToken, signRefreshToken } from "../lib/jwt";

const SALT_ROUNDS = 12;

export async function createUser(data: {
  email: string;
  username: string;
  password: string;
  displayName: string;
}) {
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      username: data.username,
      passwordHash,
      displayName: data.displayName,
    },
  });

  const payload = { userId: user.id, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  return { user, accessToken, refreshToken };
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  const payload = { userId: user.id, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  return { user, accessToken, refreshToken };
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      isSellerEnabled: true,
      sellerRating: true,
      walletBalance: true,
      createdAt: true,
    },
  });
}
