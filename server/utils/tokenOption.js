import "dotenv/config";
import { redis } from "./redis.js";

// --- Parse environment variables with fallback values ---
const accessTokenExpire = parseInt(
  process.env.ACCESS_TOKEN_EXPIRE || "300",
  10
);

const refreshTokenExpire = parseInt(
  process.env.REFRESH_TOKEN_EXPIRE || "1200",
  10
);

// --- Options for cookies ---

// Access token options for cookies
export const accessTokenOptions = {
  expires: new Date(Date.now() + accessTokenExpire * 60 * 60 * 1000),
  maxAge: accessTokenExpire * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: "lax",
};

// Refresh token options for cookies
export const refreshTokenOptions = {
  expires: new Date(Date.now() + refreshTokenExpire * 24 * 60 * 60 * 1000),
  maxAge: refreshTokenExpire * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: "lax",
};

// --- Send token and set cookies via Redis session ---
export const sendToken = (user, statusCode, res) => {
  const accessToken = user.SignAccessToken();
  const refreshToken = user.SignRefreshToken();

  // Upload session to redis
  // In JS, we remove the "as any" type casting
  redis.set(user._id, JSON.stringify(user));

  // Set secure flag in production
  if (process.env.NODE_ENV === "production") {
    accessTokenOptions.secure = true;
    refreshTokenOptions.secure = true;
  }

  // Send cookies
  res.cookie("access_token", accessToken, accessTokenOptions);
  res.cookie("refresh_token", refreshToken, refreshTokenOptions);

  res.status(statusCode).json({
    success: true,
    accessToken,
    user,
  });
};