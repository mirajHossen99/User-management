import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "./catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import jwt, { JwtPayload } from "jsonwebtoken";
import { redis } from "../utils/redis";


// checks if user is authenticated or not
export const isAuthenticated = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    const access_token = req.cookies.access_token;

    if (!access_token) {
      return next(new ErrorHandler("Please login to access this resource", 401));
    }

    // verify token
    const decoded = jwt.verify(access_token, process.env.ACCESS_TOKEN as string) as JwtPayload;
    
    // if token is not valid
    if (!decoded) {
      return next(new ErrorHandler("Invalid Token. Please login again", 401));
    }

    // fetch user from redis
    const user = await redis.get((decoded as { id: string }).id);

    // check if user exists
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }
    req.user = JSON.parse(user);

    next();

  })

// validate user role
export const authorizeRoles = (...roles: string[]) => {

    return (req: Request, res: Response, next: NextFunction) => {

        // check if user role is allowed
        if(!roles.includes(req.user?.role || "")){
            return next(new ErrorHandler(`Role: ${req.user?.role} is not allowed to access this resource`, 403));
        }
        next();
    }

}