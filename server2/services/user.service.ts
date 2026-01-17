import { Response } from "express";
import { redis } from "../utils/redis";

// get user by id
export const getUserId = async (id: string, res: Response) => {
    const userJson = await redis.get(id);
    const user = JSON.parse(userJson as string);
    
    res.status(201).json({
        success: true,
        user,
    });
}