import jwt from "jsonwebtoken";
import { CatchAsyncError } from "./catchAsyncErrors.js";
import ErrorHandler from "../utils/ErrorHandler.js";
import { redis } from "../utils/redis.js";

// checks if user is authenticated or not
export const isAuthenticated = CatchAsyncError(async (req, res, next) => {
    const access_token = req.cookies.access_token;

    if (!access_token) {
        return next(new ErrorHandler("Please login to access this resource", 401));
    }

    // verify token
    // In JS, we remove the "as string" casting
    const decoded = jwt.verify(access_token, process.env.ACCESS_TOKEN);
    
    // if token is not valid
    if (!decoded) {
        return next(new ErrorHandler("Invalid Token. Please login again", 401));
    }

    // fetch user from redis using the id from the decoded token
    const user = await redis.get(decoded.id);

    // check if user exists in Redis session
    if (!user) {
        return next(new ErrorHandler("Please login to access this resource", 404));
    }

    // Parse the user string back into an object and attach to request
    req.user = JSON.parse(user);

    next();
});

// validate user role
export const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        // check if user role is allowed
        // We use optional chaining req.user?.role to safely check the property
        if (!roles.includes(req.user?.role || "")) {
            return next(
                new ErrorHandler(
                    `Role: ${req.user?.role} is not allowed to access this resource`, 
                    403
                )
            );
        }
        next();
    };
};