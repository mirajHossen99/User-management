import { redis } from "../utils/redis.js";

// get user by id
export const getUserId = async (id, res, next) => {
    const userJson = await redis.get(id);
    // const user = JSON.parse(userJson);
    
    if (userJson) {
        const user = JSON.parse(userJson);
        return res.status(200).json({ success: true, user });
    }
}
