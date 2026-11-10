import { Body, Controller, Get, Param, Patch, Query, Req, UseInterceptors } from '@nestjs/common';
import { UserIdSchema } from './auth-contract.js';
import { requireSession, type AuthenticatedRequest } from './auth-context.js';
import { EmptyObjectSchema } from './candidate-contract.js';
import { OwnProfile, ProfilePatch, PublicProfile, type ProfileInput } from './profile-contract.js';
import { ProfileService } from './profile.service.js';
import { ResponseSchemaInterceptor } from './response-schema.interceptor.js';
import { SchemaPipe } from './schema.pipe.js';

@Controller()
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get('profile/me')
  @UseInterceptors(new ResponseSchemaInterceptor(OwnProfile))
  own(@Req() request: AuthenticatedRequest, @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    return this.profiles.own(requireSession(request).userId);
  }

  @Patch('profile/me')
  @UseInterceptors(new ResponseSchemaInterceptor(OwnProfile))
  patch(@Req() request: AuthenticatedRequest, @Body(new SchemaPipe(ProfilePatch)) input: ProfileInput,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    return this.profiles.patch(requireSession(request), input);
  }

  @Get('profiles/:userId')
  @UseInterceptors(new ResponseSchemaInterceptor(PublicProfile))
  published(@Param('userId', new SchemaPipe(UserIdSchema)) userId: string,
    @Query(new SchemaPipe(EmptyObjectSchema)) _query: object) {
    return this.profiles.published(userId);
  }
}
