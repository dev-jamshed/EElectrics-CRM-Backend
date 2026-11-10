import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { UpsertClientDto } from "../clients/dto";

export const documentTypes = ["BOOKING", "INVOICE", "QUOTATION"] as const;
export const documentStatuses = ["DRAFT", "SENT", "CONFIRMED", "PAID", "CANCELLED"] as const;
export const lineItemKinds = ["MATERIAL", "LABOUR", "OTHER"] as const;

export type DocumentTypeValue = (typeof documentTypes)[number];
export type DocumentStatusValue = (typeof documentStatuses)[number];
export type LineItemKindValue = (typeof lineItemKinds)[number];

export class LineItemDto {
  @IsIn(lineItemKinds)
  kind: LineItemKindValue;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitPrice: number;
}


export class AttachmentDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsNumber()
  size?: number;

  @IsString()
  dataUrl: string;
}
export class CreateDocumentDto {
  @IsIn(documentTypes)
  type: DocumentTypeValue;

  @IsOptional()
  @IsIn(documentStatuses)
  status?: DocumentStatusValue;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertClientDto)
  client?: UpsertClientDto;

  @IsOptional()
  @IsString()
  caseFileId?: string;

  @IsOptional()
  @IsString()
  sourceDocumentId?: string;

  @IsOptional()
  @IsBoolean()
  createAsClone?: boolean;

  @IsOptional()
  @IsString()
  parentDocumentId?: string;

  @IsString()
  jobTitle: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  greeting?: string;

  @IsOptional()
  @IsString()
  emailNote?: string;

  @IsOptional()
  @IsString()
  cc?: string;

  @IsOptional()
  @IsString()
  phoneNo?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  addressLine?: string;

  @IsOptional()
  @IsString()
  extraAddress?: string;

  @IsOptional()
  selectedAddress?: unknown;

  @IsOptional()
  @IsBoolean()
  hasOccupier?: boolean;

  @IsOptional()
  @IsString()
  occupierFirstName?: string;

  @IsOptional()
  @IsString()
  occupierLastName?: string;

  @IsOptional()
  @IsString()
  occupierPhone?: string;

  @IsOptional()
  @IsString()
  occupierPostalCode?: string;

  @IsOptional()
  @IsString()
  occupierAddressLine?: string;

  @IsOptional()
  @IsString()
  occupierExtraAddress?: string;

  @IsOptional()
  occupierSelectedAddress?: unknown;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsNumber()
  paidAmount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includeOptions?: string[];

  @IsOptional()
  @IsBoolean()
  sendMail?: boolean;

  @IsOptional()
  @IsBoolean()
  sendImages?: boolean;

  @IsOptional()
  @IsBoolean()
  invoiceCheck?: boolean;

  @IsOptional()
  @IsString()
  emailSubject?: string;

  @IsOptional()
  @IsString()
  emailBody?: string;

  @IsOptional()
  @IsString()
  pdfNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];

  @IsOptional()
  @IsString()
  issueDate?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  bookingDate?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems: LineItemDto[];
}

export class UpdateDocumentDto extends CreateDocumentDto {}

export class CloneDocumentDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RecordPaymentDto {
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  paidAt?: string;
}
