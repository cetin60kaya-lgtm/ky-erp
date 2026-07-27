import { Body, Controller, Get, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { Public } from "./public.decorator";

@Controller(["auth", "api/auth"])
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() body: any) {
    return this.authService.login(body?.username, body?.password);
  }

  @Get("me")
  me(@CurrentUser() user: any) {
    return this.authService.getMe(String(user?.id || ""));
  }

  @Post("logout")
  logout() {
    return this.authService.logout();
  }

  @Post("change-password")
  changePassword(@CurrentUser() user: any, @Body() body: any) {
    return this.authService.changePassword(
      String(user?.id || ""),
      body?.currentPassword,
      body?.newPassword,
    );
  }
}
