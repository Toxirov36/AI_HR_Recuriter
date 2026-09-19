export type TelegramBusinessRights = {
  can_reply?: boolean;
  can_read_messages?: boolean;
};

export type TelegramBusinessConnectionUpdate = {
  id: string;
  user: { id: number };
  user_chat_id: number;
  is_enabled: boolean;
  rights?: TelegramBusinessRights;
};

export type TelegramBusinessMessage = {
  message_id: number;
  business_connection_id?: string;
  from?: { id: number; first_name?: string; last_name?: string; username?: string };
  chat: { id: number };
  document?: {
    file_id: string;
    file_unique_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
};

export type TelegramUpdate = {
  update_id: number;
  business_connection?: TelegramBusinessConnectionUpdate;
  business_message?: TelegramBusinessMessage;
  edited_business_message?: TelegramBusinessMessage;
  deleted_business_messages?: { business_connection_id: string; chat: { id: number } };
};

export type TelegramResumeJob = {
  resumeId: number;
  candidateId: number;
  companyId: number;
  fileId: string;
};
