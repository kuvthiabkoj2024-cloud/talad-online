import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { AddressesService } from './addresses.service.js';
import { BankAccountsService } from './bank-accounts.service.js';
import {
  AddressesController,
  AvatarsController,
  BankAccountsController,
  ProfileController,
} from './customer-profile.controller.js';
import { ProfileService } from './profile.service.js';

/** Customer profiles, saved addresses, refund bank accounts and shop-side CRM notes (§2.4, §3.5, §4.2). */
@Module({
  imports: [AuthModule, MediaModule],
  controllers: [ProfileController, AvatarsController, AddressesController, BankAccountsController],
  providers: [ProfileService, AddressesService, BankAccountsService],
})
export class CustomersModule {}
