export const auth = (req, res, next) => {
    const { auth_code } = req.body;
    if (!auth_code || auth_code !== process.env.AUTH_CODE) {
        return res.status(403).json({
            success: false,
            message: "Access Denied"
        });
    }
    next();
};
