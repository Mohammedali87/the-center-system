import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

export default convexAuthNextjsMiddleware();

export const config = {
  matcher: ["/((?!simulator(?:/.*)?|.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"]
};
