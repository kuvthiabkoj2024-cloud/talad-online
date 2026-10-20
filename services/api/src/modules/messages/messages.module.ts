import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CmsModule } from '../cms/cms.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { MediaModule } from '../media/media.module.js';
import { ShopBotService } from './bot/shop-bot.service.js';
import { ChatbotController } from './chatbot.controller.js';
import { ChatbotService } from './chatbot.service.js';
import { CustomerMessagesController, ShopMessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';

/** Private customer ↔ shop chat (storefront Messages, Seller Center Messages) and the shop's chat bot. */
@Module({
  imports: [AuthModule, MediaModule, CatalogModule, CmsModule, OrdersModule],
  controllers: [CustomerMessagesController, ShopMessagesController, ChatbotController],
  providers: [MessagesService, ShopBotService, ChatbotService],
})
export class MessagesModule {}
