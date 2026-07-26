import { Schema, model, models } from 'mongoose';

const importJobSchema = new Schema({
  type: { type: String, enum: ['contracts', 'production', 'expenses'], required: true, index: true },
  originalFileName: { type: String, required: true },
  fileHash: { type: String, required: true, index: true },
  sheetName: String,
  headers: { type: [String], default: [] },
  rawRows: { type: [[String]], default: [] },
  mapping: { type: Map, of: String, default: {} },
  status: { type: String, enum: ['uploaded', 'validated', 'executing', 'completed', 'completed_with_errors', 'failed'], default: 'uploaded', index: true },
  totalRows: { type: Number, default: 0 }, validRows: { type: Number, default: 0 }, errorRows: { type: Number, default: 0 },
  duplicateRows: { type: Number, default: 0 }, importedRows: { type: Number, default: 0 }, skippedRows: { type: Number, default: 0 },
  previewRows: { type: [Schema.Types.Mixed], default: [] },
  idempotencyKey: { type: String, index: true },
  executedAt: Date, createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }, executedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const importRowErrorSchema = new Schema({
  importJobId: { type: Schema.Types.ObjectId, ref: 'ImportJob', required: true, index: true },
  rowNumber: { type: Number, required: true },
  code: { type: String, required: true },
  message: { type: String, required: true },
  sourceRow: Schema.Types.Mixed,
}, { timestamps: { createdAt: true, updatedAt: false } });
importRowErrorSchema.index({ importJobId: 1, rowNumber: 1, code: 1 }, { unique: true });

export const ImportJob = models.ImportJob || model('ImportJob', importJobSchema);
export const ImportRowError = models.ImportRowError || model('ImportRowError', importRowErrorSchema);
