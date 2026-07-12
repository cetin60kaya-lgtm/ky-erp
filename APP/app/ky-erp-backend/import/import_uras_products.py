import pandas as pd
import json
from datetime import datetime

# Excel dosyasını oku
file_path = r"D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ\APP\app\ky-erp-backend\import\URAS_KIMYA_URUN_KG_AYRILMIS.xlsx"

try:
    df = pd.read_excel(file_path, sheet_name=0)
    
    # Ürünleri normalize et
    products = []
    product_map = {}  # Ürün adını ID'ye eşleştirmek için
    
    for index, row in df.iterrows():
        product_name = str(row['Ürün Adı']).strip()
        kg = int(row['KG'])
        ek_bilgi = str(row['Ek Bilgi']) if pd.notna(row['Ek Bilgi']) else ""
        
        # Ürün adını normalize et (varyantları gruplamak için)
        normalized_name = product_name.upper().replace(" ", "").replace("-", "")
        
        if normalized_name not in product_map:
            # Yeni ürün oluştur
            product_id = f"uras-{len(products) + 1}"
            product_map[normalized_name] = product_id
            
            # Ürün kategorisini belirle
            category = "Genel"
            if any(keyword in product_name.upper() for keyword in ['FIXATOR', 'ACTIVATOR', 'BARRIER', 'PASTE']):
                category = "Kimyasal Katkı"
            elif any(keyword in product_name.upper() for keyword in ['KNG', 'KBT', 'KB']):
                category = "Pigment Baskı"
            elif 'EP' in product_name.upper():
                category = "Subazlı"
            elif 'FLUOR' in product_name.upper():
                category = "Fluoresan"
            elif any(keyword in product_name.upper() for keyword in ['FOIL', 'ADHESIVE']):
                category = "Yapıştırıcı"
            elif 'FUCHSIA' in product_name.upper():
                category = "Pigment Baskı"
            
            product = {
                "id": product_id,
                "urunAdi": product_name,
                "ticariAdi": product_name,
                "kategori": category,
                "birim": "KG",
                "varsayilanAmbalaj": f"{kg} KG",
                "ambalajVaryantlari": [f"{kg} KG"],
                "tedarikci": "URAS KİMYA",
                "aktif": True,
                "not": f"URAS KİMYA ürünü - {kg}KG ambalaj" + (f" - {ek_bilgi}" if ek_bilgi else ""),
                "createdAt": datetime.now().isoformat(),
                "updatedAt": datetime.now().isoformat()
            }
            products.append(product)
        else:
            # Mevcut ürüne varyant ekle
            product_id = product_map[normalized_name]
            product = next(p for p in products if p["id"] == product_id)
            
            # Yeni ambalaj varyantını ekle
            packaging = f"{kg} KG"
            if packaging not in product["ambalajVaryantlari"]:
                product["ambalajVaryantlari"].append(packaging)
                # Varsayılan ambalajı en büyük KG olarak güncelle
                if kg > int(product["varsayilanAmbalaj"].split(" ")[0]):
                    product["varsayilanAmbalaj"] = packaging
    
    # JSON olarak kaydet
    output_file = r"D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ\APP\app\ky-erp-backend\import\uras_products.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(products, f, ensure_ascii=False, indent=2)
    
    print(f"Toplam {len(products)} benzersiz ürün işlendi.")
    print(f"JSON dosyası oluşturuldu: {output_file}")
    
    # İstatistikler
    stats = {
        "toplam_urun": len(products),
        "kategoriler": {},
        "ambalaj_tipleri": set()
    }
    
    for product in products:
        cat = product["kategori"]
        stats["kategoriler"][cat] = stats["kategoriler"].get(cat, 0) + 1
        stats["ambalaj_tipleri"].update(product["ambalajVaryantlari"])
    
    print(f"\nKategori dağılımı:")
    for cat, count in stats["kategoriler"].items():
        print(f"  {cat}: {count}")
    
    print(f"\nAmbalaj tipleri: {sorted(stats['ambalaj_tipleri'])}")
    
    # İlk 5 ürünü göster
    print(f"\nİlk 5 ürün:")
    for i, product in enumerate(products[:5]):
        print(f"{i+1}. {product['urunAdi']} - {product['kategori']} - {', '.join(product['ambalajVaryantlari'])}")

except Exception as e:
    print(f"Hata: {e}")
    import traceback
    traceback.print_exc()
