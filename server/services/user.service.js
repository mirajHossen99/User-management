import { redis } from "../utils/redis.js";

// get user by id
export const getUserId = async (id, res) => {
    const userJson = await redis.get(id);
    const user = JSON.parse(userJson);
    
    res.status(201).json({
        success: true,
        user,
    });
}