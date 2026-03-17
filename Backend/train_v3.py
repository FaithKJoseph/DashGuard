import torch
import torch.nn as nn
from torchvision import datasets, transforms, models
import os

# 1. Device Setup
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"🚀 Training on: {device}")

# 2. Transforms (Professional Augmentation)
data_transforms = {
    'train': transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(), # Simulates bikes coming from left/right
        transforms.RandomRotation(15),     # Simulates different camera tilts
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ]),
    'valid': transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ]),
}

# 3. Load Data (Pointing to your 'valid' folder)
image_datasets = {
    'train': datasets.ImageFolder('cropped_dataset/train', data_transforms['train']),
    'valid': datasets.ImageFolder('cropped_dataset/valid', data_transforms['valid'])
}
dataloaders = {
    'train': torch.utils.data.DataLoader(image_datasets['train'], batch_size=32, shuffle=True),
    'valid': torch.utils.data.DataLoader(image_datasets['valid'], batch_size=32, shuffle=False)
}

# 4. Model Setup
model = models.mobilenet_v3_small(weights='DEFAULT')
# Update final layer for 2 classes (Helmet/No-Helmet)
model.classifier[3] = nn.Linear(model.classifier[3].in_features, 2)
model = model.to(device)

criterion = nn.CrossEntropyLoss()
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

# 5. Training with Best-Model Saving
best_acc = 0.0
for epoch in range(15): # 15 epochs is optimal for transfer learning
    model.train()
    for images, labels in dataloaders['train']:
        images, labels = images.to(device), labels.to(device)
        optimizer.zero_grad()
        loss = criterion(model(images), labels)
        loss.backward()
        optimizer.step()
    
    # Validation Phase
    model.eval()
    val_corrects = 0
    with torch.no_grad():
        for images, labels in dataloaders['valid']:
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            _, preds = torch.max(outputs, 1)
            val_corrects += torch.sum(preds == labels.data)
    
    val_acc = val_corrects.double() / len(image_datasets['valid'])
    print(f"Epoch {epoch+1} | Val Acc: {val_acc:.4f}")

    if val_acc > best_acc:
        best_acc = val_acc
        torch.save(model.state_dict(), 'dashguard_v3.pth')
        print("⭐️ Best model saved!")