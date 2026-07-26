-- Veri silmeden belge satırı ile gerçek Desen Havuzu modeli arasındaki kalıcı bağ.
ALTER TABLE "document_intake_lines" ADD COLUMN "model_id" TEXT;
CREATE INDEX "document_intake_lines_model_id_idx" ON "document_intake_lines"("model_id");
