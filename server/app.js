import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { ErrorMiddleware } from "./middleware/error.js";
import userRouter from "./routes/user.route.js";

export const app = express();

// body parser
app.use(express.json({ limit: "50mb" }));

// cookie parse
app.use(cookieParser());

// cors => cross origin resource sharing
app.use(
  cors({
    origin: process.env.ORIGIN,
  })
);

// Routes
app.use("/api/v1", userRouter);

// testing api
app.get("/test", (req, res, next) => {
  res.status(200).json({
    success: true,
    message: "API is working",
  });
});

// unknown routes
// app.all("/:any(.*)", (req, res, next) => {
//   const err = new Error(`Route ${req.originalUrl} not found`);
//   err.statusCode = 404;
//   next(err);
// });

// unknown routes
app.use((req, res, next) => {
  const err = new Error(`Route ${req.originalUrl} not found`);
  err.statusCode = 404;
  next(err);
});

app.use(ErrorMiddleware);