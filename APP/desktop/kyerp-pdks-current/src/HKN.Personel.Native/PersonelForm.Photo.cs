namespace HKN.Personel.Native;

public partial class PersonelForm
{
    void LoadPersonPhoto(object value)
    {
        try
        {
            var old=photo.Image;photo.Image=null;old?.Dispose();
            if(value==DBNull.Value||value is null)return;
            if(value is byte[] bytes&&bytes.Length>0){using var ms=new MemoryStream(bytes);using var img=Image.FromStream(ms);photo.Image=new Bitmap(img);return;}
            string path=Convert.ToString(value)?.Trim()??"";if(path.Length>0&&File.Exists(path)){using var img=Image.FromFile(path);photo.Image=new Bitmap(img);}
        }
        catch{photo.Image=null;}
    }
}
