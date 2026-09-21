using System.Windows;

namespace BoltGives.Desktop.Views;

public partial class TextPromptWindow : Window
{
    public string Value => ValueTextBox.Text;

    public TextPromptWindow(string title, string prompt, string value)
    {
        InitializeComponent();
        Title = title;
        PromptText.Text = prompt;
        ValueTextBox.Text = value;
        ValueTextBox.SelectAll();
        ValueTextBox.Focus();
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(ValueTextBox.Text)) return;
        DialogResult = true;
    }
}
